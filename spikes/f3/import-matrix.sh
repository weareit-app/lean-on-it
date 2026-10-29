#!/usr/bin/env bash
# Spike F3 (non-production). Times import Mathlib in fresh sandboxes under a
# few memory and CPU settings, sampling the host cgroup throughout. Duration is
# Docker's own StartedAt..FinishedAt for the container, read on the host.
#
# The runc rows are a performance baseline only, to separate gVisor's cost
# from Lean's. runc is not a sandbox candidate (#9: no fallback).
# Assumes workload.sh built the image.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

drop_caches() { sync; echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null; }

run_one() {
  local label=$1 runtime=$2 mem=$3 cpus=$4 cache=$5
  local flags
  mapfile -t flags < <(MEM_LIMIT=$mem CPUS=$cpus sandbox_flags)
  flags=("${flags[@]/--runtime=runsc/--runtime=$runtime}")
  [ "$cache" = cold ] && drop_caches
  local id full cg peak=0 file=0 anon=0 n
  id=$(docker run -d --name "f3-matrix" "${flags[@]}" "$LEAN_IMAGE" \
    sh -c 'LEAN_PATH=$(cat /opt/leanpath) exec lean /opt/work/Workload.lean')
  full=$(docker inspect --format '{{.Id}}' "$id")
  cg=$(cgroup_dir "$full")
  local last_events="" last_cpu=""
  while [ "$(docker inspect --format '{{.State.Running}}' "$id")" = true ]; do
    if [ -r "$cg/memory.peak" ]; then
      peak=$(cat "$cg/memory.peak")
      n=$(awk '$1=="file"{print $2}' "$cg/memory.stat"); [ "$n" -gt "$file" ] && file=$n
      n=$(awk '$1=="anon"{print $2}' "$cg/memory.stat"); [ "$n" -gt "$anon" ] && anon=$n
      last_events=$(tr '\n' ' ' <"$cg/memory.events")
      last_cpu=$(grep -E '^(usage_usec|nr_throttled|throttled_usec)' "$cg/cpu.stat" | tr '\n' ' ')
    fi
    sleep 0.5
  done
  local secs
  secs=$(docker inspect --format '{{.State.StartedAt}} {{.State.FinishedAt}}' "$id" |
    python3 -I -c 'import sys,datetime as d; a,b=[d.datetime.fromisoformat(x[:26].rstrip("Z")) for x in sys.stdin.read().split()]; print(f"{(b-a).total_seconds():.1f}")')
  printf '%-28s exit=%s oom=%s seconds=%s mem.peak=%sMiB max.file=%sMiB max.anon=%sMiB | %s| %s\n' \
    "$label" "$(docker inspect --format '{{.State.ExitCode}}' "$id")" \
    "$(docker inspect --format '{{.State.OOMKilled}}' "$id")" "$secs" \
    $((peak / 1048576)) $((file / 1048576)) $((anon / 1048576)) "$last_cpu" "$last_events"
  docker logs "$id" 2>&1 | grep -v 'designed for use with the module system' | tail -2
  docker rm -f "$id" >/dev/null
}

for cfg in "runsc 4g 1" "runsc 8g 1" "runsc 8g 2" "runc 4g 1"; do
  read -r rt mem cpus <<<"$cfg"
  run_one "$rt mem=$mem cpus=$cpus cold" "$rt" "$mem" "$cpus" cold
  run_one "$rt mem=$mem cpus=$cpus warm" "$rt" "$mem" "$cpus" warm
done

echo "== after the matrix"
ps -eo pid,args | grep -E 'runsc' | grep -v grep || echo "no runsc processes"
sudo /usr/local/bin/runsc --root "$RUNSC_ROOT" list
