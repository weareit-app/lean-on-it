# Spike F3 (non-production). Shared host-side settings and helpers, sourced by
# the other scripts. Everything here runs on the trusted runner host.

BASE_IMAGE=ubuntu:24.04@sha256:78d4744ead1f5b19b04d0df558ab182a5300903900755e515b2ca4d10eb2044d

# The sandbox policy under test.
MEM_LIMIT=2g          # memory.max, swap disabled (memory-swap = memory)
PIDS_LIMIT=64         # pids.max
CPUS=1                # cpu.max quota/period
TMPFS_SIZE=64m        # the only writable path, /tmp
SANDBOX_UID=65534:65534

# The full set of sandbox flags. No -v/--mount, no published ports, no socket.
sandbox_flags() {
  printf '%s\n' \
    --runtime=runsc \
    --network=none \
    --read-only \
    --tmpfs "/tmp:rw,noexec,nosuid,nodev,size=${TMPFS_SIZE}" \
    --user "$SANDBOX_UID" \
    --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --memory="$MEM_LIMIT" --memory-swap="$MEM_LIMIT" \
    --pids-limit="$PIDS_LIMIT" \
    --cpus="$CPUS" \
    --env-file=/dev/null
}

# Host-side view of a container: the runtime Docker launched it with, its
# config, and the cgroup files the host kernel enforces.
host_readback() {
  local id=$1 full
  full=$(docker inspect --format '{{.Id}}' "$id")
  echo "-- docker inspect (host)"
  docker inspect --format \
    'runtime={{.HostConfig.Runtime}} network={{.HostConfig.NetworkMode}} readonly={{.HostConfig.ReadonlyRootfs}} user={{.Config.User}} capdrop={{.HostConfig.CapDrop}} capadd={{.HostConfig.CapAdd}} secopt={{.HostConfig.SecurityOpt}} memory={{.HostConfig.Memory}} memswap={{.HostConfig.MemorySwap}} pids={{.HostConfig.PidsLimit}} nanocpus={{.HostConfig.NanoCpus}} tmpfs={{json .HostConfig.Tmpfs}} mounts={{json .Mounts}} binds={{json .HostConfig.Binds}} privileged={{.HostConfig.Privileged}}' \
    "$id"
  echo "-- host processes for this sandbox"
  ps -eo pid,user,args | grep -F "$full" | grep -v grep | cut -c1-220 || true
  echo "-- host cgroup"
  local cg
  cg=$(cgroup_dir "$full")
  echo "cgroup=$cg"
  if [ -n "$cg" ]; then
    for f in memory.max memory.swap.max memory.peak pids.max pids.peak cpu.max cpu.stat memory.events pids.events; do
      [ -r "$cg/$f" ] && echo "$f: $(tr '\n' ' ' <"$cg/$f")"
    done
  fi
}

cgroup_dir() {
  local full=$1
  find /sys/fs/cgroup -maxdepth 4 -type d -name "*${full}*" 2>/dev/null | head -1
}
