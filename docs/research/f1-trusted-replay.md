# Spike F1: trusted replay of an untrusted export

Feasibility spike for weareit-app/lean-on-it#10, the gate for the two-phase design in #9. Research,
not production. The prototype and its recorded results are not on `main`: they live on the
branch [`spike/f1-trusted-replay`](https://github.com/weareit-app/lean-on-it/tree/spike/f1-trusted-replay), under
[`spikes/f1/`](https://github.com/weareit-app/lean-on-it/tree/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/). Every link below to a `spikes/f1/` file is pinned to commit
`76c99bb`. The prototype is not in `src/`, not in the package and not in `pnpm check`.

## Conclusion

**Pass.** The two-phase design is feasible with Lean 4.35.0. A trusted verifier of about 440 lines
of Lean checks an untrusted `leanexport` export against the pinned environment, never against the
export's own claims. It accepted every honest export, including one with every trusted-named
constant removed. It refused all 18 malicious exports for their stated reason and reported all 20
malformed ones as infrastructure failures, with no crash and no stderr output. The stock
`leanchecker --from-export` accepts 28 of the same 43 exports: all three source-built honest
proofs and 25 malicious or malformed ones.

Five findings change #9's design. They are listed under "Proposed changes to #9":

1. Check (a) can only be enforced up to alpha-equivalence (binder names and binder annotations
   ignored), because `leanexport` 3.1.0 does not preserve binder names. The verifier discards the
   export's copy of every trusted constant, so this does not affect the decision. The owner should
   still confirm that this reading of "structurally identical" is acceptable.
2. In Lean 4.35.0, `native_decide` no longer goes through `Lean.ofReduceBool`, and no constant of
   that name exists. It adds an auxiliary axiom instead, which (d) refuses.
3. The verifier needs more than (a)–(e). Without the extra (s) structure checks and decoder
   limits, the toolchain's `Replay` silently skips unsafe or partial declarations and can panic.
4. The kernel replay runs without a heartbeat limit, so only phase 2's wall clock bounds it.
5. #9 does not say which category a phase-2 refusal produces.

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
| The honest export is accepted, and every malicious case is refused for its stated reason, shown in recorded output | **Pass**, with the reading of (a) in finding 1 for the owner to confirm | The results table below; [`spikes/f1/results/results.ndjson`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/results/results.ndjson) (full verifier output for each case) |
| The decision depends only on the trusted environment plus the export's new declarations; nothing in the export is believed about trusted names | **Pass** | By construction (see "How the verifier decides"). By experiment: case 04 (every trusted-named constant removed) is still accepted, and cases 10–13 and 44 (trusted names altered) are refused before the kernel runs |
| Malformed input never crashes the verifier unhandled | **Pass** for the 20 decoder cases plus the 4000-deep DAG case | Exit status 2 and a JSON `infrastructure_failure` line in each; no stderr output in any of the 43 runs. Residual risks are under "Not covered" |
| Sizes and times are recorded | **Pass** | "Measurements" |

## Environment

| Item | Value |
|---|---|
| Host | macOS 27.0.1 (26A434), Darwin 27.0.0 arm64, Apple M4 Pro, 14 cores, 48 GiB |
| Lean | 4.35.0, `arm64-apple-darwin24.6.0`, commit `eb6cafb7290e8bd5f2937522d8d804f58f02bafc`, Release |
| `lean` sha256 | `d1d9c26a539f54fe839d2aa7760bf1ac1dd76a30b26e2c9684bebf2900038fcf` |
| `leanexport` sha256 | `01327b83d6a69dbc84fa04fd671c61068b2f074e51d1bf607bf6a6b9aed5339e` |
| `leanchecker` sha256 | `d70e645ea2b0e597d0ff4cf67aa0c268483fac0b5b2b991ca2d4cd7fb78ab73c` |
| `LeanExport/Parse.lean` sha256 | `ff46b43893ad39bc8d8b71e2b028b1d7c7065ac11efbeea368d1641419f9460e` |
| `LeanExport/Basic.lean` sha256 | `2e839d4ac1ef1992cfe09c489a97928ad8f8eaea3925bc76b511c6bf85e1b8aa` |
| `Lean/Replay.lean` sha256 | `251ed00e1cedd95c5d1fc4104ac191beb1de618abbc2fc49319ff0e37d139329` |
| Export format | 3.1.0 (`lean4export` 3.1.0) |
| Mathlib | `v4.35.0`, `56a005855ea17e0b0958f73ec801ae140b0a1679`, prebuilt in the read-only learn-to-prove-it checkout (`.lake/packages`); `Mathlib/Logic/Relation.olean` sha256 `488e27d1…5b2b` |
| Obligation source | learn-to-prove-it PR #5, branch `claude/verified-exercise-graph-comp-26f20c`, commit `75590c0c628162727fb3d60632e46a4cd4de5706`, `LearnToProveIt/GraphComp/Reasoning.lean` (sha256 `b81758cc…c299bc`) |
| Verifier | [`spikes/f1/verifier/F1Verify.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/verifier/F1Verify.lean) sha256 `3f745a31dc5763dff042a377423eff4bf4fec9f3dc2d2835734225fefd80b6b6`, built by `lake build` to `f1verify` sha256 `32927e1213aedc7b3c5aa2b0bd5acc19e3ca5dac56dfacf62854ab35bcda9a05` |
| Trusted fixture | [`spikes/f1/lean/F1Trusted.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/lean/F1Trusted.lean) sha256 `4c7af69e3efe862f3d29bfacc6248f177cb8858b0823c04f22d2b2a172523677` |
| Python (case generation only) | 3.13.16 |
| Sandbox | None. F1 tests the verifier's logic. gVisor is F3–F5 |

A clean rebuild (`rm -rf build verifier/.lake && ./run-all.sh`) gave the same verifier binary hash
and byte-identical exports for every case.

## What was built

### Trusted environment

[`spikes/f1/lean/F1Trusted.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/lean/F1Trusted.lean) is a clearly labelled copy of learn-to-prove-it's reasoning
obligation. It imports `Mathlib.Logic.Relation` and defines:

```lean
def LearnToProveIt.GraphComp.Reasoning.obligation.{u, v, w} : Prop :=
  ∀ {α : Type u} {β : Type v} {γ : Type w} (f : α → β) (r : β → γ → Prop) (a : α) (c : γ),
    Relation.Comp (fun x y => f x = y) r a c ↔ r (f a) c
```

It is a plain (non-`module`) file, matching L6, and it omits the reference solution. Its import
closure is 1402 modules and 137,822 constants, loaded at the `private` level so that private
trusted names are visible.

### Verifier configuration

These values are trusted and come from configuration, never from the export:
- the environment module;
- the obligation name;
- the submitted theorem's name, `LeanOnIt.Submission.proof`;
- the reserved namespace, `LeanOnIt.Submission`;
- the permitted axioms, `propext`, `Classical.choice` and `Quot.sound`;
- the decoder limits.

### How the verifier decides

[`spikes/f1/verifier/F1Verify.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/verifier/F1Verify.lean) works in this order:

1. **Load the trusted environment** with `importModules`, at the `private` level. The trusted
   environment must contain no constant in the reserved namespace, publicly or privately. If it
   does, that is a configuration error.
2. **Decode the export under limits.** Any failure is reported as an infrastructure failure:
   - the file is at most 8 MiB, checked by `stat` before it is read;
   - it is valid UTF-8, ends in a newline, has at most 1,000,000 lines, and each line is at most
     64 KiB;
   - each line's JSON nesting is at most 6, scanned without recursion before any JSON parser
     runs;
   - the header's format version is exactly `3.1.0`, and its Lean version is exactly the
     verifier's;
   - expression depth is at most 4096, universe-level depth at most 256 and name depth at most
     128, all computed from the indices without recursion;
   - the bytes then go to the toolchain's `LeanExport.parseStream`, whose errors are caught;
   - the export has at most 100,000 constants;
   - the submitted theorem is present.
3. **Split the export's constants by name.** A name the trusted environment has is a *trusted
   name*. Any other name is *new*.
4. **(a)** Each trusted name's exported constant must match the trusted constant: the same kind,
   name, universe parameters, type, value, hints, safety, `all`, inductive, constructor and
   recursor headers, and recursor rules. The trusted side is first normalised exactly as
   `leanexport` normalises (`mdata` removed, `letE` `nondep := false`). The export's copy is then
   discarded.
5. **(b)** Each new name must lie strictly inside the reserved namespace. It must not be a private
   name, and its user-facing name (`privateToUserName`) must not be a trusted name or the user name
   of any trusted private constant.
6. **(s) Structure.** No new declaration may be unsafe, partial or a quotient, and there are at
   most 256 new declarations. Every new inductive's `all` and `ctors`, every new constructor's
   `induct`, and every new recursor's `all` must name new declarations of the right kind, so that
   a new constructor cannot claim a trusted inductive.
7. **(c)** The submitted theorem must be a `theorem` with exactly as many universe parameters as
   the obligation. Its type must be `==` either to the trusted obligation's body, with the
   theorem's own universe parameters instantiated (normalised as in (a)), or to the constant
   `obligation.{those parameters}`.
8. **(d)** There must be no new `axiom`. The axiom closure of the theorem is computed by an
   iterative walk that resolves every trusted name in the trusted environment and only new names
   in the export. That closure must lie within the permitted set.
9. **(e)** Only if steps 4–8 found nothing: `Kernel.Environment.replay` adds **only the new
   declarations** to the trusted kernel environment. Their references to trusted names resolve to
   the trusted constants. Replay rebuilds new inductives and checks the export's constructors and
   recursors against the ones the kernel generates. After replay, the theorem must be in the
   resulting kernel environment with the checked type.

The verifier prints one JSON line with the verdict (`accepted`, `refused` or
`infrastructure_failure`), `authority: verifier`, every reason found, the axiom closure, sizes and
per-phase times. It exits with 0, 1 or 2.

Nothing from the export is believed about a trusted name:
- the kernel never receives the export's copy of a trusted constant;
- the axiom walk resolves trusted names in the trusted environment;
- (c) reads the obligation from the trusted environment.

The export's new declarations are believed only after the kernel has checked them on top of the
trusted environment.

## Commands

The scripts are in [`spikes/f1/scripts/`](https://github.com/weareit-app/lean-on-it/tree/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/scripts) on the spike branch. All commands run from
`spikes/f1/` after `source env.sh`. `env.sh` sets `LEAN_PATH` to the
toolchain library, the read-only learn-to-prove-it package builds and `build/lean`. [`./run-all.sh`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/run-all.sh)
runs all of the following:

```bash
scripts/build-fixtures.sh      # lean -R . -o build/lean/<M>.olean <M>.lean, for the trusted fixture and every submission
                               # leanexport <Module> -- LeanOnIt.Submission.proof > build/exports/<Module>.ndjson
                               # leanexport F1Trusted -- LearnToProveIt.GraphComp.Reasoning.obligation (reference data)
(cd verifier && LEAN_PATH= lake build)       # builds f1verify
python3 -I scripts/mkcases.py                # copies and handcrafts build/cases/*.ndjson, writes expected.json
scripts/run-cases.sh                         # per case: /usr/bin/time -l f1verify <case>; leanchecker --from-export <case>
python3 -I scripts/summarize.py > build/summary.md    # compares with expected.json, exit 1 on any mismatch
lean --run scripts/EnvStats.lean                      # size of the trusted environment
lean --run scripts/BinderDiag.lean build/exports/F1Sub.NativeDecide.ndjson   # finding 1
```

`summarize.py` passes a case only when all of the following hold:
- the verdict and exit status are as expected;
- every expected check is among the stated reasons;
- the kernel ran exactly when (e) was the only expected reason;
- stderr is empty.

Result: `43/43 cases as expected`.

## Cases and observed results

The export sources are:
- cases 01–03, 10, 11, 20, 30, 31 and 40–42: elaborated from [`spikes/f1/lean/F1Sub/*.lean`](https://github.com/weareit-app/lean-on-it/tree/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/lean/F1Sub) or
  [`F1Forged/*.lean`](https://github.com/weareit-app/lean-on-it/tree/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/lean/F1Forged), and exported unedited with `leanexport`;
- all other cases: handcrafted by [`scripts/mkcases.py`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/scripts/mkcases.py), by editing those exports.

`F1Forged/*` are core-only files with no Mathlib, so they can define constants with trusted names.
The "Reason" column quotes the verifier's own output, from [`results/summary.md`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/results/summary.md), shortened in a
few rows. The digest is the first 16 hex digits of the export's sha256.

| Case | Export | Digest | Expected | Observed | Reason (verifier output) | `leanchecker --from-export` |
|---|---|---|---|---|---|---|
| 01-honest | Honest tactic proof | `06e4a536e8aa1cbd` | accepted | accepted | — | accepts |
| 02-honest-helper | Honest proof through a helper lemma in the namespace | `0e5cbd8bed40f7b7` | accepted | accepted | — | accepts |
| 03-honest-inductive | Honest proof that declares its own inductive | `a8af5236ef2b459a` | accepted | accepted | — | accepts |
| 04-honest-new-only | 01 with every trusted-named constant removed | `e722bc0432991380` | accepted | accepted | — | rejects (`unknown constant …obligation`) |
| 10-redef-dependency | Export brings its own `Relation.Comp` (∀ for ∃); the obligation's text is unchanged | `500373dc2e150526` | (a) | refused (a) | `Relation.Comp: differs from the trusted def in its value` | **accepts** |
| 11-redef-obligation | Export redefines `obligation` as (essentially) `True` | `1822bd8052c1e404` | (a) | refused (a) | `…Reasoning.obligation: differs from the trusted def in its value` | **accepts** |
| 12-collide-trusted | Helper renamed to the trusted `Relation.fun_eq_comp` | `eda2134b5f324dd3` | (a)/(b) | refused (a),(b) | `Relation.fun_eq_comp: differs from the trusted theorem in its levelParams`; `Relation.fun_eq_comp.match_1_1: new def outside the reserved namespace` | **accepts** |
| 13-collide-trusted-private | Helper renamed to the trusted private `_private.Init.Prelude.0.Nat.zero_le.match_1_1` | `732cad535fb62dd8` | (a) | refused (a),(b) | `_private.Init.Prelude.0.Nat.zero_le.match_1_1: differs from the trusted def in its levelParams`; … | **accepts** |
| 20-outside-namespace | Helper lemma `Learner.helper` | `62863d719bfc7d3b` | (b) | refused (b) | `Learner.helper: new theorem outside the reserved namespace LeanOnIt.Submission` (and its `match_1_1`) | **accepts** |
| 21-collide-private-user | New `_private.LeanOnIt.Fake.0.Relation.fun_eq_comp`, whose user name is trusted | `edb76346f6b55425` | (b) | refused (b) | outside the reserved namespace; `new declaration has a private name`; `collides with the trusted name Relation.fun_eq_comp` | **accepts** |
| 22-reserved-root | Helper renamed to `LeanOnIt.Submission` itself | `c6bdf3f8beff6b8c` | (b) | refused (b) | `LeanOnIt.Submission: new theorem outside the reserved namespace` | **accepts** |
| 30-weaker-universe | `theorem proof : obligation.{0, 0, 0}` | `c7d102c894e7af8d` | (c) | refused (c) | `has 0 universe parameters, the obligation has 3` | **accepts** |
| 31-weaker-statement | One direction of the iff | `2a26dca0eb578cf6` | (c) | refused (c) | `its type is neither the obligation's body nor the obligation itself, at the theorem's own universe parameters` | **accepts** |
| 40-declared-axiom | `axiom cheat : obligation`; `proof := cheat` | `5917463788ee0f64` | (d) | refused (d) | `LeanOnIt.Submission.cheat: the export declares an axiom`; `…: the theorem's axiom closure contains a non-permitted axiom` | **accepts** |
| 41-sorry | `by sorry` | `750b24979ab6de79` | (d) | refused (d) | `sorryAx: the theorem's axiom closure contains a non-permitted axiom` | **accepts** |
| 42-native-decide | `native_decide` inside the proof | `b22198335ee3cb3a` | (d) | refused (d) | `LeanOnIt.Submission.proof._native.native_decide.ax_1_1: the export declares an axiom`; `…: non-permitted axiom` | **accepts** |
| 43-ofReduceBool | 42's axiom renamed to `Lean.ofReduceBool` | `40da7cf9e4d39d05` | (d) | refused (b),(d) | `Lean.ofReduceBool: new axiom outside the reserved namespace`; `…: the export declares an axiom`; `…: non-permitted axiom` | **accepts** |
| 44-axiom-named-propext | 40's axiom renamed to the permitted `propext` | `4bd7f04972f93da0` | (a) | refused (a) | `propext: differs from the trusted axiom in its levelParams` | **accepts** |
| 50-kernel-value-is-type | The theorem's value replaced by its type | `c91ec8bd3cc93dee` | (e) | refused (e) | `kernel rejected: … (kernel) declaration type mismatch, 'LeanOnIt.Submission.proof' has type Prop but it is expected to have type …obligation…` | rejects |
| 51-kernel-universe-arity | A reference to the helper with one universe level too few | `36b215e34c1ac37d` | (e) | refused (e) | `kernel rejected: … incorrect number of universe levels parameters for 'LeanOnIt.Submission.helper', #3 expected, #2 provided` | rejects |
| 52-ctor-claims-trusted | 03 with the new constructor's `induct` set to `Iff` | `79368ac7f0a2643d` | (s) | refused (s) | `constructor LeanOnIt.Submission.Wit.mk belongs to Iff`; `constructor of Iff, which is not a new inductive` | rejects |
| 53-too-many-new | 300 extra new definitions | `498e0b4bbb656345` | (s) | refused (s) | `301 new declarations, over the 256 limit` | **accepts** |
| 60-truncated-mid-line | First half of 01's bytes | `68d02506a7a773d8` | decoder | infrastructure_failure | `decoder: export is truncated: no final newline` | rejects |
| 61-truncated-line-boundary | 01 without its last line | `4431d77293e7ff45` | decoder | infrastructure_failure | `decoder: export is incomplete: it has no LeanOnIt.Submission.proof` | **accepts** |
| 62-empty | Empty file | `e3b0c44298fc1c14` | decoder | infrastructure_failure | `decoder: export is empty` | **accepts** |
| 63-header-missing | No metadata line | `64d6b33761c93a1a` | decoder | infrastructure_failure | `decoder: export format null is not the pinned 3.1.0` | rejects |
| 64-wrong-format-version | Header says 3.0.0 | `83c47304504fe42d` | decoder | infrastructure_failure | `decoder: export format "3.0.0" is not the pinned 3.1.0` | **accepts** |
| 65-wrong-lean-version | Header says Lean 4.34.0 | `afc04fbffa846639` | decoder | infrastructure_failure | `decoder: export is from Lean "4.34.0", not the pinned 4.35.0` | **accepts** |
| 66-invalid-json | A broken JSON line | `60eae9e12416076d` | decoder | infrastructure_failure | `decoder: line 265 is not JSON: offset 18: unexpected end of input` | rejects |
| 67-unknown-object | `{"foo":1}` | `0cf6ad01a12c0a6a` | decoder | infrastructure_failure | `decoder: LeanExport parser: Unknown export object with keys [foo]` | rejects |
| 68-undefined-index | The theorem's value is index 1000000 | `41831ff285f373a4` | decoder | infrastructure_failure | `decoder: LeanExport parser: Expr not found 1000000` | rejects |
| 69-duplicate-index | An expression index bound twice | `1a4371b2f2074929` | decoder | infrastructure_failure | `decoder: LeanExport parser: Expr index 0 bound twice` | rejects |
| 70-duplicate-declaration | The theorem twice | `ad2140e713231b17` | decoder | infrastructure_failure | `decoder: LeanExport parser: Duplicate declaration: LeanOnIt.Submission.proof` | rejects |
| 71-wrong-field-type | A string where an index is expected | `02bb570aae7a7b08` | decoder | infrastructure_failure | `decoder: LeanExport parser: thmInfo invalid` | rejects |
| 72-non-utf8 | Bytes `ff fe` inserted | `30f02ec345abf2cc` | decoder | infrastructure_failure | `decoder: export is not valid UTF-8` | **accepts** |
| 73-nested-json | One line nested 100,000 deep (200 KB) | `bc05c26117a62038` | decoder | infrastructure_failure | `decoder: line 265 is 200000 bytes, over the 65536-byte limit` | rejects |
| 73b-nested-json-short | One line nested 30,000 deep (60 KB) | `fb213610f3c1ea2d` | decoder | infrastructure_failure | `decoder: line 265 nests JSON deeper than 6` | rejects |
| 74-long-line | One 70 KB name line | `35b2a71ba0f74a64` | decoder | infrastructure_failure | `decoder: line 265 is 70043 bytes, over the 65536-byte limit` | **accepts** |
| 75-oversized | 9 MiB (01 padded with valid name lines) | `42aa90f92e2cae63` | decoder | infrastructure_failure | `decoder: export is 9437185 bytes, over the 8388608-byte limit` | **accepts** |
| 76-expr-depth-bomb | An expression chain 5000 deep | `e1be0b849024ed52` | decoder | infrastructure_failure | `decoder: line 4624: expression depth over 4096` | **accepts** |
| 77-level-depth-bomb | A universe level chain 300 deep | `348395734c379620` | decoder | infrastructure_failure | `decoder: line 784: universe level depth over 256` | **accepts** |
| 78-name-depth-bomb | A name chain 200 deep | `cbf4ce6a0aca7c02` | decoder | infrastructure_failure | `decoder: line 656: name depth over 128` | **accepts** |
| 79-dag-blowup | Within every limit: a shared DAG 4000 deep (a 2^4000-node tree) as the theorem's value | `b538ee74683e3521` | (e) | refused (e) | `kernel rejected: … (kernel) function expected @Prop Prop` (in 0.48 s) | rejects |

"**accepts**" marks a malicious or malformed export that the stock checker accepts. It accepts
28 of the 43 exports:
- the three source-built honest proofs (01–03);
- 15 of the 18 malicious exports, every one except 50–52;
- 10 of the 20 malformed exports: 61, 62, 64, 65, 72 and 74–78 (exit 0, "Lean default kernel
  accepts the solution").

It also rejects the honest export 04. This reproduces the "Known so far" in #10: an empty-environment
replay checks only that the export is self-consistent.

## Measurements

### Export sizes

| Export | Bytes | Lines | Constants | Trusted-named | New | Max expression depth |
|---|---|---|---|---|---|---|
| 01-honest | 28,225 | 528 | 19 | 18 | 1 | 27 |
| 02-honest-helper | 38,068 | 740 | 21 | 18 | 3 | 32 |
| 03-honest-inductive | 45,667 | 876 | 24 | 18 | 6 | 32 |
| 04-honest-new-only | 25,606 | 518 | 1 | 0 | 1 | 27 |
| 41-sorry | 609,607 | 11,019 | 392 | 391 | 1 | 51 |
| 42-native-decide | 153,722 | 2,796 | 99 | 96 | 3 | 32 |

`leanexport` writes the whole dependency closure, so an export's size depends on which trusted
constants the proof touches. The proof's own declarations are a small part of it. In 01, 18 of
the 19 constants are trusted copies, which the verifier compares and then discards. Case 04 shows
the verifier needs only the new declarations: 25.6 KB of the 28.2 KB is shared name, level and
expression data.

### Trusted reference data

For this obligation, the trusted reference data is:
- per obligation: the obligation's name, its universe arity (3), the theorem name and namespace,
  and the permitted axioms;
- shared: the pinned environment itself.

| Item | Size |
|---|---|
| The obligation's dependency closure, as a 3.1.0 export | 15,692 bytes, 272 lines, 14 constants |
| The trusted environment the verifier loads | 1402 modules, 137,822 constants |
| Its `.olean` parts (`.olean`, `.olean.server`, `.olean.private`) | 981,565,776 bytes in all, of which Mathlib 59,969,408 |

Most of the 981 MB is Lean's own library. Mathlib's tactic modules import `Lean`, so even a small
Mathlib import loads it.

### Verifier time and memory

The verifier was run 10 times on 01-honest, warm, on the host above. The phases were timed
inside the process. Peak resident memory comes from `/usr/bin/time -l`.

| Phase | Min ms | Median ms | Max ms |
|---|---|---|---|
| Import of the trusted environment | 324 | 349.5 | 377 |
| Decode, with limits, and parse | 15 | 16 | 17 |
| Checks (a)–(d) and (s) | 3 | 4.5 | 6 |
| Kernel replay (e) | 36 | 37.5 | 41 |
| Total | 385 | 407 | 436 |

- **Peak RSS** is 683–688 MiB in every case, malformed or not. It is the memory-mapped trusted
  `.olean` files. The export adds almost nothing at these sizes.
- **Wall time** per process, including start-up, is 0.41–0.56 s warm. The first run after a
  rebuild took 3.2–4.5 s while the page cache filled. A fresh sandbox per phase starts cold unless
  the image's files are cached, so F3 should measure this.
- **Refused cases** show about 40 ms under "checks" and 0 ms of kernel time. Accepted ones show
  about 5 ms and about 37 ms. This looks like a one-off cost of first forcing the environment's
  kernel view, counted in whichever step comes first. It is not investigated further.
- **The stock `leanchecker --from-export`** took 0.04–0.25 s per case (spot-checked on 01, 41
  and 73), with no trusted import.

## Findings

1. **Binder names in an export are not faithful.** `LeanExport.Basic` deduplicates expressions in
   a `HashMap Expr Nat`, whose `BEq` is `Expr.eqv`: alpha-equivalence, ignoring binder names and
   annotations. An exported constant can therefore carry another, alpha-equivalent expression's
   binder names and binder infos. [`scripts/BinderDiag.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/scripts/BinderDiag.lean) showed this on the honest
   `native_decide` export ([`results/binder-diag.txt`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/results/binder-diag.txt)):
   - `Nat.eq_of_beq_eq_true` is exported with its second binder `x…_hyg.17 : default`, where the
     trusted constant has `m : implicit`;
   - `Nat.add`'s second binder is exported as `n`, where the trusted constant has
     `a._@._internal._hyg.0`.

   With `Expr.equal`, which also compares binder names and annotations, (a) refused 10 trusted
   constants in that honest export and dozens in the `sorry` export. The verifier therefore uses
   `Expr.eqv`, after normalising the trusted side as the exporter does. The kernel cannot see
   binder names or annotations, and the export's copy is never used, so the decision is
   unaffected.
2. **There is no `Lean.ofReduceBool` in Lean 4.35.0.** `#check Lean.ofReduceBool` reports an
   unknown identifier, and `Lean.reduceBool` is gone too. `native_decide` now adds an auxiliary
   axiom named `<decl>._native.native_decide.ax_<n>_<m>`: `#print axioms` of a `native_decide`
   theorem lists only that axiom. Case 42 is real `native_decide` output, refused by (d) because
   it is a declared axiom outside the permitted set. Case 43 handcrafts the axiom under the old
   name `Lean.ofReduceBool`, and (b) and (d) refuse it.
3. **The toolchain's `Replay` is not safe on hostile input by itself.** The verifier closes each
   gap below before replay runs:
   - It silently skips unsafe and partial constants. The verifier refuses them under (s).
   - It reads an inductive's `all` and `ctors` from the constant map with `[n]!`. A missing or
     trusted name there would panic and continue with a default value. The verifier checks every
     new inductive block's membership under (s), so replay never sees a dangling or trusted
     member. Case 52 shows a constructor that claims `Iff` refused before the kernel.
   - It skips a theorem whose name, type and level parameters equal an existing one, without
     checking its value. Only new names are passed, so this cannot apply.
   - It calls the kernel with `maxHeartbeats = 0` (unlimited) and `maxRecDepth = 0`. The F1
     verifier keeps this, so only phase 2's wall clock bounds a kernel-expensive term. No such
     term was tested.
4. **The order of the checks matters.** (d) and (s) run before (e), so the kernel never receives
   an export that declares an axiom or uses an unsafe or partial declaration. In older Lean
   versions the kernel could also evaluate `Lean.reduceBool` through compiled code. That path
   does not exist in 4.35.0, but keeping the kernel last also covers it.
5. **Each limit was set against what an elaborated export needs.** The exports elaborated from
   source (honest and malicious) reach:
   - a longest line of 814 bytes;
   - an expression depth of at most 51;
   - a name depth of at most 13;
   - a universe level depth of at most 4.

   The limits are 64 KiB, 4096, 128 and 256. A nesting guard runs before any JSON parser.
   `LeanExport`'s own JSON reader survived 100,000 levels in `leanchecker` (cases 73 and 73b end
   in `Expected JSON object`), but the guard does not rely on that.
6. **Truncation at a line boundary is not visible in format 3.1.0.** The format has no trailer.
   `leanexport` writes a constant after its dependencies, so the submitted theorem is always the
   last line, and any line-boundary truncation removes it. The verifier therefore reports a
   missing theorem as an incomplete export, an infrastructure failure (case 61). This depends on
   the exporter's order. A phase-1 exporter that writes in another order needs a trailer (see
   change 4).
7. **The reserved namespace limits what honest learners may write.** Auxiliary declarations land
   under the declaration that creates them (`proof.match_1_1`, `proof._native…`, `Wit.casesOn`),
   so a proof elaborated inside `namespace LeanOnIt.Submission` stays inside it. A learner's own
   `private` declaration would be named `_private.<module>.0.LeanOnIt.Submission.…`. That name is
   outside the namespace, so it is refused. So is anything a learner declares outside the
   namespace (case 20).

## Proposed changes to #9

The design stands. These changes refine it:

1. **(a) means alpha-equivalence modulo `mdata` and `letE` `nondep`, *or* exports carry no trusted
   constants.** With `leanexport` 3.1.0, (a) can only be alpha-equivalence after the exporter's
   normalisation. The F1 verifier does exactly this, and the owner should confirm it.

   The stricter alternative is better. Phase 1 (F2, L2) would write an export that holds **only
   the new declarations**, with the names, levels and expressions they use. Check (a) then
   becomes "the export holds no trusted-named constant at all". That rule is simpler, avoids
   comparing hundreds of trusted copies, and shrinks exports. In 41, 391 of 392 constants are
   trusted copies. Case 04 shows the verifier already works on such an export. `leanexport`
   cannot write one today, because it always writes the dependency closure. A phase-1 exporter
   built on `LeanExport.Basic.dumpConstant` that skips trusted names would be needed. Add this to
   F2 or L2.
2. **Name the extra checks in the spec.** #9's list of what phase 2 establishes should add:
   - the decoder limits, with the format version and Lean version pinned in the header;
   - (s) structure: no unsafe, partial or quotient new declarations, complete new inductive blocks
     only, and a cap on new declarations;
   - "(d) and (s) before the kernel".
3. **Run the kernel under a limit.** The production verifier should replay with its own copy of
   `Replay`'s ordering, adapted and labelled, passing a kernel heartbeat limit. A kernel
   exhaustion is then reported as `resource_exhausted` (authority `runtime`), as user story 8
   asks, instead of running until the wall clock. The phase-2 wall clock stays as the backstop.
4. **Frame the export.** If phase 1 uses its own exporter (change 1), it should end the file with a
   trailer giving its line count and digest, so that truncation is detected in any order. The
   verifier strips the trailer before calling the 3.1.0 parser.
5. **Decide the category of a phase-2 refusal.** The refinement says `rejected` is always advisory
   and "no `rejected` result is ever `verified`". F1 therefore cannot assign a category to a
   phase-2 refusal. Two options to choose between:
   - map refusals by (a), (b), (s) and a declared axiom to `policy_violation` with authority
     `verifier`, since the export broke the protocol, and map (c), the axiom closure and (e) to
     `rejected` with authority `advisory`, keeping phase 1's reason;
   - map every phase-2 refusal to `policy_violation` with authority `verifier`.

   This is the owner's call.
6. **Correct the wording on `Lean.ofReduceBool`.** In #9's F1 table, "Proof using `sorryAx` or
   `Lean.ofReduceBool`" should read "`sorryAx`, or `native_decide`'s auxiliary axiom (Lean ≥ 4.35;
   formerly `Lean.ofReduceBool`)". The axiom-closure rule covers both, so the design is unchanged.
7. **Tell learners about the namespace rule.** Phase 1 should elaborate the submission inside the
   reserved namespace. The rule that a submission may not use `private` or declare names outside
   that namespace should be documented as learner-facing feedback.
8. **Image and start-up.** Phase 2 loads the same pinned environment as phase 1. For this
   obligation that is 981 MB of `.olean` data, 1402 modules, about 0.35 s and about 0.7 GB of
   RSS, warm. F3 should measure it cold in a fresh `runsc` sandbox. The phase-2 memory limit must
   allow for these mapped files.

## Not covered

- **No sandbox.** F1 tests the verifier's decision logic only. Limits on time, memory, pids and
  output in the real `runsc` sandbox are F3–F5.
- **Kernel cost.** A valid but kernel-expensive term, such as deep `Nat` reduction or
  `decide`-style proofs, was not tested. See change 3.
- **Memory under the decoder caps.** No export was built to maximise memory while staying within
  the caps (8 MiB, 4096-deep, 100,000 constants). Peak RSS stayed within 688 MiB for every case
  run, including the 4000-deep DAG.
- **One obligation.** One Mathlib-backed obligation was used, with no `module`-system obligation.
  The trusted environment is imported at the `private` level, so private trusted names are
  visible to (a) and (b). How module-system visibility interacts with citations is L6.
- **No fuzzing.** The handcrafted cases are deliberate, not randomised.
- **The trusted `.olean` files are not re-checked.** `importModules` loads them as they are.
  Their integrity rests on the pinned image digest (#9, image).
- **Phase-1 output.** Elaboration was done with the stock `lean` and `leanexport`, not with
  learn-to-prove-it's checker (F2, L2).

## Dependencies on learn-to-prove-it

- **L1.** F1 used PR #5's obligation from branch commit `75590c0c…`, copied and labelled in
  [`spikes/f1/lean/F1Trusted.lean`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/lean/F1Trusted.lean). Pinning a merged commit is still needed.
- **L2.** Proposed change 1 adds to L2: phase 1 exports only the submission's new declarations,
  ideally with a trailer.
- **L5.** The verifier's configuration (obligation name, theorem name, namespace, permitted axioms)
  is what the exercise-family export must provide per exercise.
- **L6.** The trusted fixture was a plain, non-`module` file, as L6 requires.

Nothing in learn-to-prove-it was modified. Its built Mathlib packages were read through
`LEAN_PATH` only.

## Owner decisions (2026-10-28)

After these findings, the owner recorded decisions on #9
([comment](https://github.com/weareit-app/lean-on-it/issues/9#issuecomment-6486389746)). Where they differ from the proposals above,
the comment wins. In short:
- Phase 1 exports only new declarations, and (a) becomes "the export contains no trusted-named
  constant at all". F2 (#12) must show the actual checker produces such an export (L2).
- Phase-2 refusals are `policy_violation` with authority `verifier`. Decoder failures are
  `infrastructure_failure` (verifier). Kernel and runtime limits are `resource_exhausted`
  (runtime).
- The export is framed by a trailer with its line count and digest. The decoder limits, (s), the
  check order and an independent kernel heartbeat limit become part of what phase 2 establishes.
- Of #15, only this document is authorized to merge. The prototype stays on the spike branch.
