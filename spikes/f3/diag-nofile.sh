#!/usr/bin/env bash
# Spike F3 (non-production). Diagnoses "Too many open files" during
# import Mathlib under runsc: host-side fd counts and limits of the gVisor
# processes while the import runs. Assumes workload.sh built the image.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
mapfile -t flags < <(sandbox_flags)

echo "== host limits"
echo "fs.nr_open=$(cat /proc/sys/fs/nr_open) fs.file-max=$(cat /proc/sys/fs/file-max) vm.max_map_count=$(cat /proc/sys/vm/max_map_count)"
systemctl show containerd docker -p LimitNOFILE -p LimitNOFILESoft

probe() {
  local name=$1; shift
  echo "== $name"
  id=$(docker run -d --name "f3-diag-$name" "$@" "${flags[@]}" "$LEAN_IMAGE" \
    sh -c 'echo "guest ulimit -n: $(ulimit -n) / $(ulimit -Hn)"; LEAN_PATH=$(cat /opt/leanpath) lean /opt/work/Workload.lean; echo lean-exit=$?; sleep 3')
  full=$(docker inspect --format '{{.Id}}' "$id")
  sleep 1
  sentry=$(pgrep -f "runsc-sandbox.*$full" | head -1 || true)
  gofer=$(pgrep -f "runsc-gofer.*$full" | head -1 || true)
  echo "sentry pid=$sentry gofer pid=$gofer"
  [ -n "$sentry" ] && sudo grep -E 'open files|address space' "/proc/$sentry/limits"
  [ -n "$gofer" ] && sudo grep -E 'open files' "/proc/$gofer/limits"
  local max_s=0 max_g=0 max_maps=0 n
  while [ "$(docker inspect --format '{{.State.Running}}' "$id")" = true ]; do
    n=$(sudo ls "/proc/$sentry/fd" 2>/dev/null | wc -l); [ "$n" -gt "$max_s" ] && max_s=$n
    n=$(sudo ls "/proc/$gofer/fd" 2>/dev/null | wc -l); [ "$n" -gt "$max_g" ] && max_g=$n
    n=$(sudo sh -c "wc -l < /proc/$sentry/maps" 2>/dev/null || echo 0); [ "$n" -gt "$max_maps" ] && max_maps=$n
    sleep 0.3
  done
  echo "peak host fds: sentry=$max_s gofer=$max_g; peak sentry host mappings=$max_maps"
  docker logs "$id" 2>&1 | tail -3
  docker rm -f "$id" >/dev/null
}

probe default
