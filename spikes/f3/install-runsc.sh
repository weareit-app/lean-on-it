#!/usr/bin/env bash
# Spike F3 (non-production). Installs the pinned gVisor release on the runner
# host, verifies its hashes, and registers runsc as a Docker runtime.
# Runs on the trusted host, never inside the sandbox.
set -euo pipefail

RELEASE=20261005.0
TARBALL_URL="https://storage.googleapis.com/gvisor/releases/release/${RELEASE}/x86_64/gvisor.tar.zstd"
# Published alongside the tarball and checked against a local download on 2026-10-28.
TARBALL_SHA512=27fed731b432d6a39d908956623fd273979fda66b3ccf4b9c12413ea417c516e18a9dc3cced403fb28efe495d64dce4251f51cf8c4d9f4a72f9833bd96b6bb35
RUNSC_SHA256=210b437a9cfae51e8f8c9074ed19b8b5e59477178e2e391a18117d8d6b924f7a
SHIM_SHA256=2bff94d15386d36e62e2f105ba835f650e55327cb731d96820cbbfe5592c2a6b

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "== download"
curl -fsSL --retry 3 -o "$work/gvisor.tar.zstd" "$TARBALL_URL"
echo "${TARBALL_SHA512}  $work/gvisor.tar.zstd" | sha512sum -c -

mkdir "$work/x"
tar --zstd -xf "$work/gvisor.tar.zstd" -C "$work/x"
echo "${RUNSC_SHA256}  $work/x/runsc" | sha256sum -c -
echo "${SHIM_SHA256}  $work/x/containerd-shim-runsc-v1" | sha256sum -c -

echo "== install"
sudo install -m 0755 "$work/x/runsc" "$work/x/containerd-shim-runsc-v1" /usr/local/bin/
sudo mkdir -p /usr/local/lib/gvisor-bin
sudo install -m 0755 "$work/x/gvisor-bin/"* /usr/local/lib/gvisor-bin/
/usr/local/bin/runsc --version

echo "== register with Docker"
# Default flags: systrap platform, gVisor's own network stack (unused with
# --network=none), overlay root. --debug-log keeps per-sandbox logs on the host.
sudo /usr/local/bin/runsc install --runtime=runsc -- \
  --debug-log=/tmp/runsc-logs/ --debug
sudo mkdir -p /tmp/runsc-logs
sudo systemctl restart docker
echo "-- /etc/docker/daemon.json"
sudo cat /etc/docker/daemon.json
echo "-- docker info runtimes"
docker info --format '{{json .Runtimes}}'
docker version --format 'client {{.Client.Version}} server {{.Server.Version}}'
