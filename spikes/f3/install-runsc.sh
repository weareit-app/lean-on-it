#!/usr/bin/env bash
# Spike F3 (non-production). Installs the pinned gVisor release on the runner
# host, verifies its hashes, and registers runsc as a Docker runtime.
# Runs on the trusted host, never inside the sandbox.
#
# `runsc install` is not used: in this release it downloads the sidecar
# binaries (gvisor-bin/) itself, without a hash we pin. Every binary is taken
# from the verified tarball and the Docker config is written here instead.
set -euo pipefail

RELEASE=20261005.0
TARBALL_URL="https://storage.googleapis.com/gvisor/releases/release/${RELEASE}/x86_64/gvisor.tar.zstd"
# Published alongside the tarball and checked against a local download on 2026-10-28.
TARBALL_SHA512=27fed731b432d6a39d908956623fd273979fda66b3ccf4b9c12413ea417c516e18a9dc3cced403fb28efe495d64dce4251f51cf8c4d9f4a72f9833bd96b6bb35

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "== download"
curl -fsSL --retry 3 -o "$work/gvisor.tar.zstd" "$TARBALL_URL"
echo "${TARBALL_SHA512}  $work/gvisor.tar.zstd" | sha512sum -c -

mkdir "$work/x"
tar --zstd -xf "$work/gvisor.tar.zstd" -C "$work/x"
(cd "$work/x" && sha256sum -c -) <<'EOF'
210b437a9cfae51e8f8c9074ed19b8b5e59477178e2e391a18117d8d6b924f7a  runsc
2bff94d15386d36e62e2f105ba835f650e55327cb731d96820cbbfe5592c2a6b  containerd-shim-runsc-v1
c454d0b5fab4627d8915194f901a70c66bb4792f680e3f75d2a47516382b449a  gvisor-bin/checkpointgofer
3315d7ad7c2d3751d349e4976fa02da1da6fd7e41746c35622304e5fabe4fce0  gvisor-bin/gvisor-sentry-prewarmer
0050e7c6063e17de1729500cd73b18322d85c758eb0ffcab18e539df7110bd12  gvisor-bin/gvisor_sentry
03af90d07ea466c10ecc3e3ba839b2a59540959dd3286aea3886917cba850c11  gvisor-bin/runsc-fd-parking
7bcbe5846a0f6d34c7d2bd312033bb92ab6305b9ac93e09b753b3474f91f27b2  gvisor-bin/runsc-metric-server
EOF

echo "== install"
sudo install -m 0755 "$work/x/runsc" "$work/x/containerd-shim-runsc-v1" /usr/local/bin/
# runsc looks for its sidecars in gvisor-bin/ next to its own binary.
sudo install -d -m 0755 /usr/local/bin/gvisor-bin
sudo install -m 0755 "$work/x/gvisor-bin/"* /usr/local/bin/gvisor-bin/
/usr/local/bin/runsc --version
sha256sum /usr/local/bin/runsc /usr/local/bin/gvisor-bin/*

echo "== register with Docker"
sudo mkdir -p /tmp/runsc-logs
# Default flags: systrap platform, overlay root. --debug-log keeps
# per-sandbox logs on the host for the findings.
sudo python3 -I - <<'EOF'
import json, os
path = "/etc/docker/daemon.json"
config = json.load(open(path)) if os.path.exists(path) else {}
print("existing daemon.json:", json.dumps(config))
config.setdefault("runtimes", {})["runsc"] = {
    "path": "/usr/local/bin/runsc",
    "runtimeArgs": ["--debug-log=/tmp/runsc-logs/", "--debug"],
}
json.dump(config, open(path, "w"), indent=2)
EOF
sudo systemctl restart docker
echo "-- /etc/docker/daemon.json"
sudo cat /etc/docker/daemon.json
echo
echo "-- docker info runtimes"
docker info --format '{{range $k, $v := .Runtimes}}{{$k}}={{$v.Path}} {{end}}'
docker version --format 'client {{.Client.Version}} server {{.Server.Version}}'
