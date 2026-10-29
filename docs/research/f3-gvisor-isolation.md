# Spike F3: gVisor isolation and limits for Lean on Linux

Spike [#11](https://github.com/weareit-app/lean-on-it/issues/11) for the sandboxed exercise evaluation spec [#9](https://github.com/weareit-app/lean-on-it/issues/9). Run 2026-10-29 on a GitHub-hosted Linux runner, as the owner approved for this spike.

**Non-production.** The spike code is not part of any merge. It is kept on the branch [`spike/f3-gvisor`](https://github.com/weareit-app/lean-on-it/tree/spike/f3-gvisor) under `spikes/f3/`, with its workflow in `.github/workflows/spike-f3.yml`, which runs only on pushes to that branch. Links below are pinned to commit `efbcdf6`.

## Conclusion

**Inconclusive: the gate stays open.**

- **The boundary can be established.** Pinned `runsc` installs from hash-verified files only. It runs Lean and `import Mathlib` under the whole policy. The runtime, every limit and the process's user, capabilities and environment are read back from host-side sources and match the policy.
- **The adversarial table was not tested.** The probe programs that attempt each prohibited effect could not be written in this session within Anthropic's safety controls. The owner's instruction was to record such rows as not tested and leave the gate open, so no row of that table is recorded as passed. Host-side configuration evidence is given for several rows. It shows what the sandbox was given, not that an attempt failed.
- **Three findings change #9:**
  - Docker adds three host bind mounts and a second tmpfs.
  - The Sentry needs a raised host open-file limit to import Mathlib.
  - A cold `import Mathlib` takes minutes under the current limits.

  Proposed changes are at the end.

## Pass criteria

| Criterion | Result | Basis |
|---|---|---|
| Every prohibited effect is shown not to happen, by host-side observation | **Not met (not tested)** | No attempt was made from inside the sandbox. See [Adversarial table](#adversarial-table). |
| Every limit is read back and matches the policy | **Pass** | Memory, swap, pids, CPU, `RLIMIT_NOFILE`, user, capabilities, `no-new-privileges`, read-only root, tmpfs size and network namespace, read from `docker inspect`, the OCI `config.json` handed to `runsc`, and the host cgroup files. See [Limits read back](#limits-read-back). |
| Cleanup leaves nothing running in every termination path | **Inconclusive** | After normal exit and after `docker rm -f`, no `runsc` process and no sandbox remain in any run. The wall-clock and parent-kill paths were not exercised. |
| gVisor's documented limits restated, with what this spike observed | **Pass** | See [gVisor's documented limits](#gvisors-documented-limits). |

## Environment

| Item | Value |
|---|---|
| Host | GitHub-hosted `ubuntu-latest`: Ubuntu 24.04.5 LTS, kernel `7.0.0-1017-azure`, x86_64, 4 vCPU, 16 GB RAM, 3 GB swap, 145 GB root disk |
| cgroups | v2 (`cgroup2fs`), controllers `cpuset cpu io memory hugetlb pids rdma misc dmem`, systemd driver (`system.slice/docker-<id>.scope`) |
| Docker | 28.0.4, client and server, with `containerd-shim-runc-v2` driving the runtime binary |
| gVisor | `release-20261005.0`, tag commit `60faa657ca99f3398e04c8dbc580a848df20f2f2`, `runsc --version`: `release-20261005.0`, `spec: 1.2.1`. Default platform (systrap) and default filesystem flags (directfs on), plus `--debug --debug-log` |
| Base image | `ubuntu:noble-20260917@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55` (pushed 2026-10-04; amd64 manifest `sha256:f610ab94648195aa356059f5b41d6085c9d4d903c072430cdd1af7bdb646106b`, image created 2026-09-18) |
| Lean | 4.35.0, `lean-4.35.0-linux.tar.zst`, sha256 `7289597a44543246c9227b8cae501767e095ce17f6d448b95fc4a8dc97268f6d`, verified in the build; `Lean (version 4.35.0, x86_64-unknown-linux-gnu, commit eb6cafb7290e8bd5f2937522d8d804f58f02bafc, Release)` |
| Mathlib | v4.35.0, commit `56a005855ea17e0b0958f73ec801ae140b0a1679`; its manifest pins plausible `dfa4f381`, LeanSearchClient `d6b4c7be`, importGraph `a41f0e9a`, proofwidgets `df72b022`, aesop `4a174c49`, Qq `dce0ad79`, batteries `66e46918`, Cli `c24fe607` |
| Workload image | `f3-lean:spike`, built on the runner from [`spikes/f3/image/`](https://github.com/weareit-app/lean-on-it/tree/efbcdf6a5709e57b32e0cc09a32158fb939e1437/spikes/f3/image): 10.56 GB (Lean 3.0 GB, `.lake` 7.3 GB, 9052 `.olean` files). Image ID in the final run: ``sha256:299ae02a3f5a28f4afa3141277b45ed6f17058127e51ed44096b048cd1b25601``. Not reproducible byte for byte: each build has a new ID |
| Build-stage apt packages | Unpinned, build stage only: ca-certificates 20260816ubuntu0.24.04.1, curl 8.5.0-2ubuntu10.16, git 1:2.43.0-1ubuntu7.4, zstd 1.5.5+dfsg2-2build1.1 |

### Pins and their review

- **gVisor `release-20261005.0`.** Published 2026-10-08, 20 days old on 2026-10-28. `release-20261012` was published only on 2026-10-16, which is too new. Apache-2.0.
  - The release is now one tarball, `x86_64/gvisor.tar.zstd`, with SHA-512 `27fed731b432d6a39d908956623fd273979fda66b3ccf4b9c12413ea417c516e18a9dc3cced403fb28efe495d64dce4251f51cf8c4d9f4a72f9833bd96b6bb35`. It was downloaded and checked locally and again on every run.
  - The published `.sha512` comes from the same storage bucket as the tarball. It shows integrity, not who published it.
  - The tarball holds `runsc`, `containerd-shim-runsc-v1` and five helper binaries in `gvisor-bin/`. All are static ELF executables; there are no install scripts. Each one's SHA-256 is pinned in [`install-runsc.sh`](https://github.com/weareit-app/lean-on-it/blob/efbcdf6a5709e57b32e0cc09a32158fb939e1437/spikes/f3/install-runsc.sh) and checked before install.
- **Lean v4.35.0.** Released 2026-10-12, 16 days old; the same toolchain as F1.
- **Mathlib v4.35.0.** The tag for that toolchain; its tag commit is dated 2026-10-13.
- **Ubuntu `noble-20260917`.** Replaced the first base pin. That digest (`ubuntu:24.04@sha256:78d4744e…`) belonged to an image built on 2026-10-25, which breaks the two-week rule.
- **Actions.** The workflow uses only `actions/checkout` v7.0.1, already pinned and reviewed in `docs/architecture/ci-actions.md`, so no new action pin was needed.
  - `permissions: contents: read`, `persist-credentials: false`, no secrets.
  - It runs only on pushes to `spike/f3-gvisor`.
  - It has a 75-minute timeout, and an `always()` step removes any `f3-` container.

## Method

Everything runs on the runner host except what runs inside the sandbox. Every observation recorded as evidence comes from the host:

- `docker inspect`;
- the OCI `config.json` in the shim's bundle directory, which is the spec `runsc` receives;
- `runsc --root /var/run/docker/runtime-runc/moby list`;
- the host process table;
- the host cgroup files under `/sys/fs/cgroup/system.slice/docker-<id>.scope/`.

Output from inside the sandbox is labelled untrusted and used only as a supplement.

The sandbox flags, from [`lib.sh`](https://github.com/weareit-app/lean-on-it/blob/efbcdf6a5709e57b32e0cc09a32158fb939e1437/spikes/f3/lib.sh):

```text
docker run --runtime=runsc --network=none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --user 65534:65534 --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=4g --memory-swap=4g --pids-limit=64 --cpus=1 \
  --ulimit nofile=65536:65536 --env-file=/dev/null  <image> <command>
```

There are no `-v` or `--mount` options, no published ports and no socket.

Steps, one script each, run in order by the workflow:

1. `install-runsc.sh`:
   - downloads and verifies the tarball and each binary;
   - installs them, with the helpers in `/usr/local/bin/gvisor-bin/`;
   - writes the `runsc` runtime into `/etc/docker/daemon.json` itself;
   - raises containerd's `LimitNOFILE`;
   - restarts containerd and Docker.
2. `feasibility.sh`: runs `sleep` in the base image under the full policy, reads everything back, then removes it.
3. `workload.sh`: builds the Lean image, then times sandbox start-up. It then runs one `import Mathlib` while sampling the host cgroup, and keeps the sandbox for 5 s after Lean exits so that the final values can be read.
4. `import-matrix.sh`: times `import Mathlib` in fresh sandboxes under four settings, each with a cold host page cache (`drop_caches`) and then warm. The duration is Docker's own `StartedAt`..`FinishedAt`.
5. `diag-nofile.sh`: a diagnostic, run once, described under [the open-file finding](#finding-2-the-sentry-needs-a-raised-host-open-file-limit).

### Runs

| Run | Commit | Result | Job time | What it established |
|---|---|---|---|---|
| [40806091509](https://github.com/weareit-app/lean-on-it/actions/runs/40806091509) | `5a70890` | success | 35 s | First install and runtime check. `runsc install` downloaded unverified helpers ([finding 1](#finding-1-runsc-install-downloads-unverified-binaries)) |
| [40808001118](https://github.com/weareit-app/lean-on-it/actions/runs/40808001118) | | success | ~10 min | Verified-only install. Lean could not read Mathlib's `.olean` files: the cache unpacks them as mode `600 root`, an image-build fault, not a gVisor one |
| [40808355991](https://github.com/weareit-app/lean-on-it/actions/runs/40808355991) | `b68ce0a` | success | 4 min | Files made readable. Import fails with "Too many open files" |
| [40808832498](https://github.com/weareit-app/lean-on-it/actions/runs/40808832498) | `c901b86` | success | 5 min | `--ulimit nofile=65536` applied and read back; same failure |
| [40809395451](https://github.com/weareit-app/lean-on-it/actions/runs/40809395451) | `499685c` | success | 6 min | Diagnosis: the Sentry's host fd table reaches its host limit of 65536 |
| [40809988962](https://github.com/weareit-app/lean-on-it/actions/runs/40809988962) | `a652ac0` | success | 19 min | containerd `LimitNOFILE=1048576`: `import Mathlib` succeeds in runsc |
| [40811896198](https://github.com/weareit-app/lean-on-it/actions/runs/40811896198) | `4d848d2` | failure | 8 min | Matrix stopped after its first row (a `pipefail` bug in the log filter) |
| [40812725957](https://github.com/weareit-app/lean-on-it/actions/runs/40812725957) | `efbcdf6` | success | 13 min | Final run; the source of the figures below unless stated |

## Limits read back

From the final run's host readback of a sandbox running `import Mathlib`:

| Policy | `docker inspect` | OCI `config.json` given to runsc | Host cgroup | Match |
|---|---|---|---|---|
| Runtime runsc | `runtime=runsc` | (bundle under the runsc root) | Processes `runsc-gofer`, `runsc-sandbox` (comm `gvisor_sentry`), `runsc-fd-parking` under `containerd-shim-runc-v2`; listed by `runsc --root /var/run/docker/runtime-runc/moby list` as `running` | yes |
| No network | `network=none` | `network` namespace, no path | — | yes |
| Read-only root | `readonly=true` | `root.readonly: true` (overlay2 `merged` directory) | — | yes |
| tmpfs 64 MiB | `/tmp: rw,noexec,nosuid,nodev,size=64m` | `/tmp` tmpfs `size=64m` | — | yes, but see [finding 3](#finding-3-docker-adds-host-bind-mounts-and-a-second-tmpfs) |
| Non-root | `user=65534:65534` | uid 65534, gid 65534, additionalGids [65534] | — | yes |
| No capabilities | `capdrop=[ALL]`, no `capadd` | `capabilities: {}` (all five sets empty) | — | yes |
| `no-new-privileges` | `[no-new-privileges]` | `noNewPrivileges: true` | — | yes |
| No host mounts | `mounts=[]`, `binds=null` | **three read-only bind mounts added by Docker** | — | **no**, [finding 3](#finding-3-docker-adds-host-bind-mounts-and-a-second-tmpfs) |
| Memory 4 GiB, no swap | `memory=4294967296 memswap=4294967296` | `memory.limit 4294967296, swap 4294967296` | `memory.max 4294967296`, `memory.swap.max 0` | yes |
| pids 64 | `pids=64` | `pids.limit 64` | `pids.max 64`; `pids.peak` 26 idle, 31 during the import | yes |
| CPU 1 | `nanocpus=1000000000` | `cpu.quota 100000, period 100000` | `cpu.max 100000 100000` | yes |
| `RLIMIT_NOFILE` 65536 | — | `RLIMIT_NOFILE soft 65536 hard 65536` | — | yes |
| Environment | `--env-file=/dev/null` | env names `HOSTNAME`, `PATH` only | — | yes |

The cgroup is the host's systemd scope, so the limits gVisor relies on are enforced by the host kernel, which is what gVisor's documentation says.

## Adversarial table

Not one row was attempted from inside the sandbox; see the conclusion for why. Every row is **not tested**, and none counts as passed. The right-hand column gives the host-side configuration evidence, which is all this spike can offer for that row. It shows what the sandbox was given, not that an attempt failed.

| Attempt | Required host observation | Status | Configuration evidence (not proof of prevention) |
|---|---|---|---|
| TCP to a host listener | Listener receives nothing | not tested | `network=none`; a network namespace with no path; gVisor's netstack has only loopback |
| DNS lookup | Fails | not tested | No network. Docker still bind-mounts a generated `/etc/resolv.conf` ([finding 3](#finding-3-docker-adds-host-bind-mounts-and-a-second-tmpfs)) |
| Cloud metadata address | Unreachable | not tested | No network, as above |
| Read a host canary file | Not readable | not tested | Root is the image's overlay `merged` directory. No bind mounts except Docker's three generated files |
| Read a canary in the launcher's environment | Not visible | not tested | The launcher exported `F3_CANARY_ENV`; the OCI spec gave the process only `HOSTNAME` and `PATH` |
| Read `~`, `~/.ssh`, the runtime socket | Not readable | not tested | No such path is mounted; the Docker socket is not mounted |
| Write a host path | Host file unchanged | not tested | Root read-only; writable paths are `/tmp` and Docker's `/dev/shm`, both tmpfs |
| Allocate past the memory limit | OOM kill in runtime state | not tested | `memory.max` was read back. A legitimate `import Mathlib` held `memory.peak` at exactly 4 GiB with 35,373 `memory.max` reclaim events and no OOM kill: the cap held, mostly by reclaiming file cache |
| Spin past the CPU limit | Throttled, CPU time recorded | not tested | `cpu.max 100000 100000` read back. The legitimate import recorded `usage_usec` 44.4 s over 143 s, with 6 throttled periods |
| Fork bomb through `IO.Process.spawn` | pids peak ≤ cap | not tested | `pids.max 64` read back; `pids.peak` 31 during the import |
| Unbounded output | Host stops reading at its cap and kills the sandbox | not tested | The host-side output cap is not part of this spike's harness |
| Run past the wall clock | Teardown; no `runsc` or Lean process; sandbox gone | not tested | `docker rm -f` of a running sandbox left no `runsc` process and an empty `runsc list`, but that path was not timer-driven |
| Kill the launching process mid-run | Same cleanup | not tested | — |

## Import timing

`lean --version` in a fresh sandbox, host wall clock around `docker run --rm`: 0.36–0.41 s, three runs per build. That is the sandbox start-up floor.

`import Mathlib` plus two small declarations ([`Workload.lean`](https://github.com/weareit-app/lean-on-it/blob/efbcdf6a5709e57b32e0cc09a32158fb939e1437/spikes/f3/image/Workload.lean)), each in a fresh sandbox:

Duration is Docker's `StartedAt`..`FinishedAt`, read on the host. Cold means host page cache dropped first; warm means immediately after the cold run. Memory figures are maxima of the host cgroup's `memory.peak` and `memory.stat` (`file`, `anon`) while Lean ran. The runc rows are a performance baseline only, to separate gVisor's cost from Lean's. runc is not a sandbox candidate.

| Runtime | Memory | CPUs | Cache | Seconds | `memory.peak` | `file` | `anon` | CPU time | Throttled periods | `memory.max` events | OOM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| runsc | 4 GiB | 1 | cold | **143.2** | 4096 MiB (cap) | 3428 MiB | 348 MiB | 44.4 s | 6 | 35,373 | no |
| runsc | 4 GiB | 1 | warm | 29.3 | 4096 MiB (cap) | 3528 MiB | 340 MiB | 16.2 s | 107 | 2,085 | no |
| runsc | 8 GiB | 1 | cold | **37.8** | 7988 MiB | 7320 MiB | 329 MiB | 19.7 s | 8 | 0 | no |
| runsc | 8 GiB | 1 | warm | 12.7 | 952 MiB | 388 MiB | 270 MiB | 12.6 s | 123 | 0 | no |
| runsc | 8 GiB | 2 | cold | 38.4 | 7994 MiB | 7311 MiB | 342 MiB | 19.3 s | 0 | 0 | no |
| runsc | 8 GiB | 2 | warm | **8.0** | 949 MiB | 388 MiB | 266 MiB | 12.1 s | 22 | 0 | no |
| runc (baseline) | 4 GiB | 1 | cold | 118.8 | 4096 MiB (cap) | 3628 MiB | 406 MiB | 24.6 s | 0 | 27,124 | no |
| runc (baseline) | 4 GiB | 1 | warm | 16.0 | 4035 MiB | 3362 MiB | 351 MiB | 5.7 s | 1 | 0 | no |

Earlier runs at the 4 GiB, 1 CPU setting: cold 194–202 s and warm 22–46 s in run 40809988962, and cold 157 s in run 40811896198. Times vary widely between runners, so read these as orders of magnitude. A warm sandbox's memory figures understate what a fresh host needs: pages already cached on the host were charged to an earlier, now-removed cgroup.

No runc row was run at 8 GiB, so gVisor's own overhead is bounded only roughly. At 4 GiB, cold, runsc used 44.4 s of CPU against runc's 24.6 s; warm, 16.2 s against 5.7 s.

## Findings

### Finding 1: `runsc install` downloads unverified binaries

In `release-20261005.0`, `runsc install` downloaded the helper binaries from `…/20261005.0/x86_64/gvisor.tar.bz2` into `/usr/local/bin/gvisor-bin` itself, with no hash we pin. Its own log called this "BEST-EFFORT FUNCTIONALITY which will STOP WORKING in a few weeks". The fix used from run 2 onwards:

- take every binary, the helpers included, from the verified tarball;
- check each one's SHA-256;
- install the helpers in `gvisor-bin/` next to `runsc`, where it looks for them;
- write the runtime entry into `daemon.json` directly.

`runsc install` is not called.

### Finding 2: the Sentry needs a raised host open-file limit

`import Mathlib` failed with "Too many open files", always at the same module. That happened even with the sandbox's `RLIMIT_NOFILE` at 65536, read back from the OCI spec.

The host-side diagnostic showed the cause. The Sentry's host fd table reached exactly 65536, which is its host `RLIMIT_NOFILE`, inherited from containerd's systemd unit (`LimitNOFILE=65536` on the runner). With directfs, gVisor holds a host fd for each file the application has mapped. Lean 4.35 maps several files per module (`.olean`, `.olean.server`, `.olean.private`, `.ir`) across about 9000 modules.

With containerd raised to `LimitNOFILE=1048576`, the import succeeds. The Sentry then peaks at **111,446** host fds while the gofer holds 29. The sandbox's own fd limit was not the constraint.

This is a host capacity requirement, not a weakness in the boundary. It makes a host setting part of the supported configuration. The trusted environment for phase 2 is about 1402 modules (F1), so phase 2 needs fewer fds than full Mathlib.

### Finding 3: Docker adds host bind mounts and a second tmpfs

The OCI spec Docker gives `runsc` contains mounts that `docker run` never asked for:

- read-only bind mounts of Docker-generated host files: `/etc/resolv.conf`, `/etc/hostname` and `/etc/hosts`, from `/var/lib/docker/containers/<id>/`;
- a writable 64 MiB tmpfs at `/dev/shm`, as well as `/tmp`.

Docker's `inspect` output reports `mounts=[]` and `binds=null`, so only the OCI spec shows them.

#9 requires "no host bind mounts of any kind" and "one size-capped tmpfs". Under Docker as configured here, neither holds literally.

The files are generated per container, and the network namespace has no interface. Even so, `resolv.conf` carries host-derived resolver configuration. They are also exactly the kind of host-backed path that gVisor's documented limit on host-backed file reads is about.

### Finding 4: a cold `import Mathlib` takes minutes and fills the memory cap

See the timing table. The host cgroup counts the Sentry's file cache against the sandbox: 3.4 GiB of `file` against 348 MiB of `anon` in the 4 GiB, 1 CPU case. The import therefore runs pinned at `memory.max` and reclaims constantly. The memory limit, not CPU, dominates the time:

- With 4 GiB, a cold import takes 143 s, and runc takes 119 s under the same limit. So most of that time is the cgroup reclaiming file cache, not gVisor.
- With 8 GiB, a cold import takes 38 s, and warm takes 12.7 s on 1 CPU and 8.0 s on 2.
- At 8 GiB a cold import still charges about 7.3 GiB of file cache. A limit below the mapped working set trades memory for minutes of wall clock.
- The anonymous memory Lean itself uses stays at 270–410 MiB in every case.

### Other observations

- The image build is the only stage with network, and it took 145–179 s (Mathlib's cache served by `lake`). The 10.6 GB image fits easily on the runner's 145 GB disk.
- The in-sandbox kernel string is `4.19.0-gvisor` and the process ran as uid 65534. Both come from inside the sandbox and are untrusted; they merely agree with the host readback.
- **F5 (observations only, no conclusions).**
  - The runner has cgroup v2 with the systemd driver.
  - Docker on the runner accepts a custom runtime after a daemon restart.
  - `sudo` is available, which the containerd limit change needed.
  - Public-repository standard runners cost nothing; the eight runs used about 66 job-minutes.

## gVisor's documented limits

From gVisor's [security model](https://gvisor.dev/docs/architecture_guide/security/) and [filesystem guide](https://gvisor.dev/docs/user_guide/filesystem/), restated with what this spike observed:

| Documented limit | Observed here |
|---|---|
| No protection against hardware side channels; the host and platform are responsible | Not testable here. The runner is a shared-tenancy Azure VM, so side channels from other tenants are outside gVisor's scope as well as this spike's |
| Resource limits rely on host cgroups | Confirmed: every limit was enforced in the host's `system.slice/docker-<id>.scope`. Finding 2 adds a host rlimit, containerd's `LimitNOFILE`, as a further host dependency |
| The host kernel or hypervisor is ultimately responsible against escapes from the Sentry | Unchanged; this spike adds nothing to it |
| Host-backed file access: the gofer donates fds for each mount, and with directfs (the default) the Sentry reads them directly | Confirmed in scale: 111,446 host fds held by the Sentry during the import. Docker's three generated files are host-backed reads beyond the image (finding 3). `--directfs=false` routes every operation through the gofer; it was not measured |
| Network policy belongs at the container level | `--network=none` gave a network namespace with no path |

## Proposed changes to #9

1. **Install.** Install `runsc` and its `gvisor-bin/` helpers only from the verified tarball, each hash pinned, and never through `runsc install` (finding 1). Preflight checks the installed binaries' hashes.
2. **Host prerequisite.** The runtime's host `RLIMIT_NOFILE` must be at least a stated value, for example 262144. That is twice the observed full-Mathlib peak of 111,446; phase 2's environment needs less. Preflight reads it back from the Sentry or its parent and fails closed if it is lower (finding 2).
3. **Mounts.** Either drive `runsc` from a lean-on-it-generated OCI spec with exactly the policy's mounts, or record a dated decision that accepts Docker's three read-only generated files and removes `/dev/shm` (`--ipc=none` or `--shm-size`). Either way, preflight reads the mount list from the OCI spec, not from `docker inspect`, which does not show these mounts (finding 3).
4. **Readback source.** Use the OCI `config.json` given to `runsc`, together with the host cgroup files, as the trusted readback. `docker inspect` alone misses mounts and rlimits.
5. **Memory and time.** The memory limit must cover the mapped environment's file cache as well as Lean's heap. For full Mathlib that is about 8 GiB, against about 350 MiB of heap. Size phase 1 and phase 2 against measured imports of their actual pinned environments: phase 2's 1402 modules map far less. Set wall-clock limits from the cold, fresh-sandbox time on the target host, which is about 40 s for full Mathlib with enough memory and minutes without (finding 4).
6. **Image build.** Make the Mathlib outputs readable by the sandbox uid in the same layer as the cache download.
7. **Adversarial suite.** The real-sandbox suite stays a release gate. It needs probe programs written and reviewed outside this session; F3's adversarial criteria stay open until that evidence exists.
