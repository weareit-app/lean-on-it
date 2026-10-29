# Spike F3 (non-production). Shared host-side settings and helpers, sourced by
# the other scripts. Everything here runs on the trusted runner host.

# ubuntu:noble-20260917, pushed 2026-10-04 (index digest; amd64 manifest
# sha256:f610ab94648195aa356059f5b41d6085c9d4d903c072430cdd1af7bdb646106b).
BASE_IMAGE=ubuntu:noble-20260917@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
LEAN_IMAGE=f3-lean:spike
# runsc state directory under Docker.
RUNSC_ROOT=/var/run/docker/runtime-runc/moby

# The sandbox policy under test.
# memory.max, swap disabled (memory-swap = memory). Sized for import Mathlib:
# F1 measured 981 MB of .olean files and ~0.7 GB resident when warm.
MEM_LIMIT=4g
PIDS_LIMIT=64         # pids.max
CPUS=1                # cpu.max quota/period
TMPFS_SIZE=64m        # the only writable path, /tmp
SANDBOX_UID=65534:65534
# RLIMIT_NOFILE inside the sandbox. import Mathlib opens several files per
# module (.olean, .olean.private, .olean.server, .ir) across ~9000 files and
# fails at the runtime default. Enforced by gVisor's own kernel; its memory
# counts against the cgroup.
NOFILE=65536

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
    --ulimit "nofile=${NOFILE}:${NOFILE}" \
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
  echo "-- OCI spec runsc was given (host bundle config.json)"
  sudo python3 -I - "/run/containerd/io.containerd.runtime.v2.task/moby/$full/config.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
p = c["process"]
caps = p.get("capabilities", {})
print("user:", p["user"].get("uid"), p["user"].get("gid"), "additionalGids:", p["user"].get("additionalGids"))
print("noNewPrivileges:", p.get("noNewPrivileges"))
print("capabilities:", {k: v for k, v in caps.items()})
print("rlimits:", p.get("rlimits"))
print("env names:", sorted(e.split("=", 1)[0] for e in p.get("env", [])))
print("root:", c["root"])
print("mounts:", [(m["destination"], m.get("type"), m.get("source"), m.get("options")) for m in c["mounts"]])
print("namespaces:", [n["type"] + ("=" + n["path"] if n.get("path") else "") for n in c["linux"]["namespaces"]])
r = c["linux"].get("resources", {})
print("resources:", {k: r.get(k) for k in ("memory", "pids", "cpu")})
print("cgroupsPath:", c["linux"].get("cgroupsPath"))
PY
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
