#!/usr/bin/env bash
# Spike F3 (non-production). Builds the Lean + Mathlib image on the host, then
# runs the workload in fresh runsc sandboxes under the full policy. Timings are
# host wall clock around `docker run`; limits are read from the host cgroup.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"

echo "== build image (network: build stage only)"
start=$(date +%s)
docker build --progress=plain --build-arg BASE_IMAGE="$BASE_IMAGE" \
  -t "$LEAN_IMAGE" "$here/image"
echo "build seconds: $(( $(date +%s) - start ))"
docker image inspect --format 'image id={{.Id}} size={{.Size}}' "$LEAN_IMAGE"
docker history --no-trunc --format '{{.Size}}\t{{.CreatedBy}}' "$LEAN_IMAGE" | cut -c1-160
df -h /

mapfile -t flags < <(sandbox_flags)
lean_cmd='LEAN_PATH=$(cat /opt/leanpath) exec lean /opt/work/Workload.lean'

timed_run() {
  local label=$1; shift
  local t0 t1 status=0
  t0=$(date +%s.%N)
  docker run --rm "${flags[@]}" "$LEAN_IMAGE" "$@" || status=$?
  t1=$(date +%s.%N)
  printf '%s: exit=%s seconds=%.2f\n' "$label" "$status" "$(echo "$t1 - $t0" | bc)"
}

drop_caches() { sync; echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null; }

echo "== sandbox start-up baseline"
for i in 1 2 3; do timed_run "lean --version #$i" lean --version; done

echo "== import Mathlib, cold host page cache, fresh sandbox each"
for i in 1 2 3; do drop_caches; timed_run "cold import #$i" sh -c "$lean_cmd"; done

echo "== import Mathlib, warm host page cache, fresh sandbox each"
for i in 1 2 3; do timed_run "warm import #$i" sh -c "$lean_cmd"; done

echo "== host cgroup during an import (sandbox kept 5 s after Lean exits)"
drop_caches
id=$(docker run -d --name f3-workload "${flags[@]}" "$LEAN_IMAGE" \
  sh -c "LEAN_PATH=\$(cat /opt/leanpath) lean /opt/work/Workload.lean; echo lean-exit=\$?; sleep 5")
full=$(docker inspect --format '{{.Id}}' "$id")
host_readback "$id"
cg=$(cgroup_dir "$full")
last=""
while [ "$(docker inspect --format '{{.State.Running}}' "$id")" = true ]; do
  if [ -n "$cg" ] && [ -r "$cg/memory.peak" ]; then
    last="memory.peak=$(cat "$cg/memory.peak") memory.current=$(cat "$cg/memory.current") pids.peak=$(cat "$cg/pids.peak") $(grep -E '^(usage_usec|nr_throttled|throttled_usec)' "$cg/cpu.stat" | tr '\n' ' ')"
  fi
  sleep 0.5
done
echo "last host cgroup sample: $last"
docker logs "$id" 2>&1 | tail -5
docker inspect --format 'exit={{.State.ExitCode}} oomkilled={{.State.OOMKilled}}' "$id"
docker rm -f "$id" >/dev/null

echo "== after removal"
ps -eo pid,args | grep -E 'runsc' | grep -v grep || echo "no runsc processes"
sudo /usr/local/bin/runsc --root "$RUNSC_ROOT" list
