#!/usr/bin/env bash
# Spike F3 (non-production). Minimal check that the pinned runsc runs a
# container under the full sandbox policy, confirmed from the host side.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

echo "== host"
uname -a
cat /etc/os-release | grep -E '^(PRETTY_NAME|VERSION_ID)='
nproc; free -m; df -h / /mnt 2>/dev/null || true
echo "cgroup fs: $(stat -fc %T /sys/fs/cgroup)"
cat /sys/fs/cgroup/cgroup.controllers

echo "== pull base image"
docker pull "$BASE_IMAGE"
docker image inspect --format 'id={{.Id}} created={{.Created}} digests={{.RepoDigests}}' "$BASE_IMAGE"

echo "== start a long-running sandbox"
mapfile -t flags < <(sandbox_flags)
id=$(docker run -d --name f3-feasibility "${flags[@]}" "$BASE_IMAGE" sleep 60)
sleep 2
host_readback "$id"

echo "-- runsc state (host, runsc's own root)"
sudo /usr/local/bin/runsc --root "$RUNSC_ROOT" list
echo "-- host processes named runsc"
ps -eo pid,user,comm,args | grep -E 'runsc' | grep -v grep | cut -c1-200 || true

echo "-- in-sandbox (untrusted, supplementary only)"
docker exec f3-feasibility sh -c 'id; cat /proc/version; ls /proc/self/fd | wc -l' || true

docker rm -f f3-feasibility >/dev/null
echo "== after removal"
ps -eo pid,args | grep -E 'runsc' | grep -v grep || echo "no runsc processes"
docker ps -a --format '{{.Names}}' | grep -c f3- || true
