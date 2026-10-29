# Spike F2: a new-only export from the actual checker

Feasibility spike for weareit-app/lean-on-it#12, part of #9. Research, not production. The
prototype and its recorded results are not on `main`. They live on the branch
[`spike/f2-new-only-export`](https://github.com/weareit-app/lean-on-it/tree/spike/f2-new-only-export),
under [`spikes/f2/`](https://github.com/weareit-app/lean-on-it/tree/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2).
Every link below to a `spikes/` file is pinned to a commit:
- F2 at `0c73f46`;
- F1 at `76c99bb`, on `spike/f1-trusted-replay`, which F2 does not change.

## Conclusion

**Pass.** Phase 1 runs learn-to-prove-it's checker once. It can write a complete export that holds
**only the declarations the checker kernel-checked**, plus the names, levels and expressions they
use, framed by a version header and a line-count and digest trailer. Phase 2 then decides from
that export and the pinned environment alone. It never sees the submission and runs none of its
code.

| Run | Result |
|---|---|
| Honest submissions to all three graph-comp exercises, among them both valid solutions in the exercise docs | 11 of 11 accepted, authority `verified`. Every export has no trusted-named constant. |
| Adversarial submissions, from `Adversarial.lean` and variants | None accepted. Each is either rejected by phase 1 (advisory) or refused by phase 2 (`policy_violation`). |
| Forged stdout verdicts | No effect on the decision. |
| Trailer cases | Every truncation and alteration detected. |
| Total | 27/27 submission cases and 26/26 export cases as expected. A rerun gave byte-identical exports. |

Upstream (L2) is not available yet, so phase 1 uses a **labelled local copy** of the checker:
[`lean/F2/CheckerL2.lean`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/lean/F2/CheckerL2.lean).
It is learn-to-prove-it PR #5's `LearnToProveIt/Checker.lean` at commit
`75590c0c628162727fb3d60632e46a4cd4de5706`, original sha256
`adcf55a4dcd19512ca53237d88d20ca69784ff42ec8a2c928f932bfa75924675`. It differs only by a header
comment and three marked lines, listed below. Its checking rules are unchanged.

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
| Honest submissions to all three graph-comp exercises produce new-only exports, with no trusted-named constant, that F1's verifier accepts | **Pass** | Cases h01–h11: `trustedNamed: 0`, `accepted`/`verified` (F1's verifier as copied and adapted; see "Phase 2") |
| The declarations come from the checker's actual elaboration result, not a second elaboration or the submission text | **Pass** | The labelled copy hands over its own kernel-checked `decls` array, the one its kernel loop added. Case h09's marker shows the learner's code ran once in phase 1 and never in phase 2 |
| Truncating or altering the export is detected by the trailer | **Pass** | Cases t01–t10 |
| Each adversarial submission ends rejected by phase 1 or refused by F1's verifier; none is accepted | **Pass** | Cases a01–a11. a12 is accepted by design: an honest proof plus a harmless extra theorem inside the namespace |
| A forged stdout verdict has no effect on the verifier's decision | **Pass** | Cases f01–f04 |
| The exact interface needed from learn-to-prove-it is written down (L2, L3, L4), proposed in #9, not changed here | **Pass** | "Interfaces needed from learn-to-prove-it"; posted on #9 |

## Environment

The host and toolchain are as in F1: macOS 27.0.1 on Apple M4 Pro, Lean 4.35.0 (commit
`eb6cafb7`), and Mathlib `v4.35.0` (`56a00585`) read-only from the learn-to-prove-it checkout.

**learn-to-prove-it source.** PR #5 at commit `75590c0c628162727fb3d60632e46a4cd4de5706`, read with
`git archive`; the checkout is not modified. Digests (sha256):

| File | sha256 |
|---|---|
| `LearnToProveIt/Checker.lean` | `adcf55a4dcd19512ca53237d88d20ca69784ff42ec8a2c928f932bfa75924675` |
| `LearnToProveIt/GraphComp/Comprehension.lean` | `c5fb4e0a361d5f348ef0c0e0acff54ec304e73c7ed3773f2d849cb62e6b1765b` |
| `LearnToProveIt/GraphComp/Reasoning.lean` | `b81758ccb987b3acce7e076421f1e66fbd484c0bfd1eeb965fbc7b11bcc299bc` |
| `LearnToProveIt/GraphComp/Transfer.lean` | `950bea0b49283a9b797023b312808e55e8e82a6cd3b28ab3570923d762da7646` |
| `LearnToProveItTest/Adversarial.lean` | `6adb072a060583b0cb60f2f1e72fa344b84c391f0a305fb9f0317492e2e4ef4a` |

**Trusted environment.** The three graph-comp modules, compiled with `lean` from those sources.
Their import closure is 1802 modules and 169,473 constants. Phase 1 and phase 2 load the same
modules.

**F2 code (sha256):**

| File | sha256 |
|---|---|
| `CheckerL2.lean` | `41c4bb45…` |
| `NewOnlyExport.lean` | `ecf81913…` |
| `Sha256.lean` | `3bc7fbab…` |
| `F2Phase1.lean` | `6c4e3966…` |
| `F2Verify.lean` | `36a96ad9…` |
| `f2phase1` binary | `60b2ffe6…` |
| `f2verify` binary | `7d0850f3…` |

The full digests are in
[`results/environment.txt`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/results/environment.txt).
F1's verifier source at `76c99bb` has sha256 `3f745a31…`, the value F1 recorded.

**Checks of the tooling.** `Sha256.lean` was checked against `shasum -a 256` on six inputs: empty,
`abc`, 55 and 64 random bytes (the padding boundaries), 1000 random bytes, and a 9 KB file.
`./run-all.sh` from a clean `build/` passes. A second run of all 27 submissions gave
byte-identical exports, whose digests are in `results/export-digests.txt`.

## What was built

```text
trusted runner (scripts/evaluate.py)                       the role of #9's runner, unsandboxed here
  phase 1  f2phase1 <exercise> <submission> <export>       runs the learner's code: untrusted
    importModules [Comprehension, Reasoning, Transfer]     loadExts, initializers, mainModule set
    withDeclNameForAuxNaming LeanOnIt.Submission.proof     aux names under the reserved theorem
      checkSubmission (labelled copy)                      elaborate once, kernel-check, axioms
        onAccepted decls                                   the checker's own kernel-checked decls
          newOnlyExport                                    LeanExport.dumpConstant, trusted = visited
            header (format 3.1.0, Lean 4.35.0) · new decls · trailer {lines, sha256}
    stdout: advisory phase-1 verdict
  phase 2  f2verify <exercise> <export>                    never sees the submission
    trailer → decoder limits → (a) no trusted name → (b) → (s) → (c) → (d) → (e) kernel replay
  category ← phase 2's output; with no export, a phase-1 rejection → rejected (advisory),
             anything else → infrastructure_failure
```

### The checker copy (L2 stand-in)

The copy differs from the original in these places, listed in full in
[`checker-l2.diff`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/checker-l2.diff),
49 lines. `run-all.sh` regenerates the diff and fails if it changes.

1. **A header comment** labels the file as a copy and gives the original's commit and digest.
2. **A new parameter, `theoremName? : Option Name := none`.** With `none`, behaviour is as
   upstream.
3. **`let name := theoremName?.getD (freshSubmissionName (← getEnv))`.** The caller fixes the
   theorem's name. F2 passes the reserved `LeanOnIt.Submission.proof`.
4. **A new parameter, `onAccepted : Array Declaration → CoreM Unit := fun _ => pure ()`.** It is
   called once, after the axiom check passes, with the same `decls` array the kernel loop checked:
   the auxiliary declarations first, the proof last.

Parsing, elaboration, the forced kernel check, the axiom rule and citations are unchanged. With
the defaults, the copy behaves as the original.

### The phase-1 driver

[`lean/F2Phase1.lean`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/lean/F2Phase1.lean)
does the following, all outside the checker:
- **Environment:** imports the three exercise modules with `loadExts := true`, after
  `enableInitializersExecution`.
- **Main module:** sets one, as Lean's frontend does. Without it, every `run_tac` failed with
  `Environment.realizeConst: realizedImportedConsts is empty`, and the checker rejected that
  submission as ill-typed.
- **Scope:** elaborates with `currNamespace := LeanOnIt.Submission` and `open LearnToProveIt
  GraphComp`. That is the scope learn-to-prove-it's own tests use, and that both valid solutions
  in `docs/exercises/graph-comp.md` assume: they cite `graph_comp_iff` unqualified.
- **Auxiliary names:** wraps the call in `withDeclNameForAuxNaming LeanOnIt.Submission.proof`.
  Without it, term-mode `match` creates auxiliary matchers named
  `_private.<main module>.0.match_<n>`, outside the reserved namespace, and `n` grows across calls
  in one process. With it they are `LeanOnIt.Submission.proof.match_1`, …, deterministic.
  `currNamespace` alone does not change these names; setting the elaborator's `declName?` did not
  either.
- **Output:** writes the export only for an accepted verdict, and prints the verdict as advisory
  JSON.

### The new-only exporter

[`lean/F2/NewOnlyExport.lean`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/lean/F2/NewOnlyExport.lean),
about 40 lines, uses the toolchain's `LeanExport.Basic` unchanged:
- `initState`, then `visitedConstants :=` every constant of the trusted environment, so the
  dependency walk writes none of them;
- `dumpMetadata` (the 3.1.0 header, with the Lean version and githash);
- `dumpConstant` for each declaration name the checker handed over;
- output captured with `IO.withStdout` into a buffer;
- a trailer line, `{"trailer":{"lines":N,"sha256":"<hex>"}}`, where `N` and the digest cover every
  byte before the trailer.

Lean's core library has no SHA-256, so the spike adds a 60-line one
([`Sha256.lean`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/lean/F2/Sha256.lean)).

### Phase 2: F1's verifier, copied and adapted

[`lean/F2Verify.lean`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/lean/F2Verify.lean)
copies [F1's verifier](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/verifier/F1Verify.lean),
sha256 `3f745a31…`. Every change is marked `-- F2:` and listed in
[`verifier-f2.diff`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/verifier-f2.diff):

- **The trailer is checked first.** The last line, within the line limits, must be the trailer.
  Its `lines` must equal the number of lines before it, and its `sha256` the digest of those
  bytes. The trailer is stripped before the toolchain parser sees the bytes.
- **Check (a) follows the owner's decision.** Any constant whose name the trusted environment
  has is refused (`the export contains the trusted … ; a new-only export holds none`). F1's
  comparison is no longer used.
- **The trusted environment** is the three graph-comp modules. The obligation is chosen by a
  pinned exercise id (`f2verify <exercise-id> <export>`).
- **Categories follow the owner's table on #9:**
  - `accepted` (authority `verified`);
  - `policy_violation` (authority `verifier`) for (a)–(e) and (s);
  - `infrastructure_failure` (authority `verifier`) for the decoder.

Everything else is F1's: the decoder limits, (b), (s), (c), (d), the "(d) and (s) before the
kernel" order, and the kernel replay of the new declarations only.

## Commands

From `spikes/f2/`, `./run-all.sh` runs everything:

```bash
source ./env.sh                       # F1's env.sh + build/lean on LEAN_PATH
git -C "$LTP_REPO" archive 75590c0c… LearnToProveIt LearnToProveIt.lean docs/exercises LearnToProveItTest | tar -x -C build/ltp
lean -R . -o build/lean/<M>.olean -i build/lean/<M>.ilean <M>.lean     # the three graph-comp modules
diff -u build/ltp/LearnToProveIt/Checker.lean lean/F2/CheckerL2.lean    # must equal checker-l2.diff
(LEAN_PATH= lake build)                                                 # f2phase1, f2verify, f2sha
python3 -I scripts/cases.py && python3 -I scripts/evaluate.py > build/summary.md
lean -R lean_closure -o build/lean/F2Closure.olean lean_closure/F2Closure.lean
leanexport F2Closure -- LeanOnIt.Submission.proof > build/out/x01-closure.leanexport.ndjson
python3 -I scripts/tamper.py && python3 -I scripts/run-tamper.py > build/tamper-summary.md
```

`evaluate.py` runs, for each case:
1. `/usr/bin/time -l f2phase1 <exercise> <submission> <export>`;
2. if an export exists, `/usr/bin/time -l f2verify <exercise> <export>`;
3. classification from phase 2's output only.

A case passes only when all of the following hold:
- the final category and the expected checks match;
- an `accepted` result has authority `verified` and exit 0;
- phase 2's stderr is empty.

The full per-case records are in
[`results/results.ndjson`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/results/results.ndjson)
and [`results/tamper-results.ndjson`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/results/tamper-results.ndjson).
The tables are in [`results/summary.md`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/results/summary.md)
and [`results/tamper-summary.md`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/results/tamper-summary.md).
The submission texts are in [`scripts/cases.py`](https://github.com/weareit-app/lean-on-it/blob/0c73f4692778506b2cf2742a98003e2d832abdca/spikes/f2/scripts/cases.py).

## Results: submissions

The "Phase 1" column is the advisory verdict phase 1 printed. The "Final" column is what the
runner reports.

| Case | Exercise | Submission | Phase 1 | Export (bytes, constants, trusted-named) | Final | Reason (from the output) |
|---|---|---|---|---|---|---|
| h01 | comprehension | tactic: `refine ⟨rfl, ?_, 7, rfl, …⟩; intro h; cases h` | accepted | 10,908 · 1 · 0 | **accepted** (verified) | — |
| h02 | comprehension | `change … at h; omega` | accepted | 14,199 · 2 · 0 | **accepted** (verified) | — |
| h03 | reasoning | term mode with `match` (two auxiliary matchers) | accepted | 25,733 · 3 · 0 | **accepted** (verified) | — |
| h04 | reasoning | `simp [Relation.Comp]` | accepted | 7,486 · 1 · 0 | **accepted** (verified) | — |
| h05 | reasoning | `rintro` | accepted | 9,137 · 1 · 0 | **accepted** (verified) | — |
| h06 | reasoning | cites the trusted `graph_comp_iff` | accepted | 4,306 · 1 · 0 | **accepted** (verified) | — |
| h07 | transfer | uses the supplied fact `graph_comp_iff` | accepted | 12,656 · 1 · 0 | **accepted** (verified) | — |
| h08 | transfer | without the supplied fact | accepted | 20,069 · 2 · 0 | **accepted** (verified) | — |
| h09 | reasoning | honest, plus a metaprogram that prints a marker on stderr each time it runs | accepted | 4,309 · 1 · 0 | **accepted** (verified) | marker: phase 1 ×1, phase 2 ×0 |
| h10 | reasoning | the valid solution in `docs/exercises/graph-comp.md` | accepted | 17,463 · 2 · 0 | **accepted** (verified) | — |
| h11 | transfer | the valid solution in `docs/exercises/graph-comp.md` | accepted | 15,374 · 2 · 0 | **accepted** (verified) | — |
| a01 | reasoning | `set_option debug.skipKernelTC true in` with a false `decide +kernel` lemma | rejected (kernel rejected) | none | **rejected** (advisory) | `(kernel) application type mismatch …` |
| a02 | reasoning | a metaprogram declares upstream's reserved `_learnToProveIt_submission`, then an honest proof | accepted | 4,602 · 2 · 0 | **policy_violation** (verifier) | `(b) _learnToProveIt_submission: new theorem outside the reserved namespace` |
| a03 | reasoning | a metaprogram declares `LeanOnIt.Submission.proof` itself | rejected (kernel rejected) | none | **rejected** (advisory) | `(kernel) constant has already been declared 'LeanOnIt.Submission.proof'` |
| a04 | reasoning | a metaprogram adds an axiom the proof does not use | accepted | 4,498 · 2 · 0 | **policy_violation** (verifier) | `(d) LeanOnIt.Submission.cheat: the export declares an axiom` |
| a05 | reasoning | a metaprogram adds an axiom, and the proof uses it | rejected (disallowed axioms) | none | **rejected** (advisory) | ``disallowedAxioms #[`LeanOnIt.Submission.cheat]`` |
| a06 | reasoning | `let rec` | rejected (ill-typed) | none | **rejected** (advisory) | `` `let rec` and `where` are not supported in a submission `` |
| a07 | reasoning | recursion-limit attack: `maxRecDepth 40`, 200 nested `id (` | rejected (limit exceeded) | none | **rejected** (advisory) | `maximum recursion depth has been reached` |
| a08 | reasoning | a limit a tactic catches and logs (`decide` on a 200-term fold) | rejected (limit exceeded) | none | **rejected** (advisory) | `maximum recursion depth has been reached` |
| a09 | reasoning | `native_decide` | rejected (disallowed axioms) | none | **rejected** (advisory) | ``#[`LeanOnIt.Submission.proof._native.native_decide.ax_1]`` |
| a10 | reasoning | `sorry` | rejected (incomplete) | none | **rejected** (advisory) | `incomplete` |
| a11 | comprehension | a reasoning proof, submitted to comprehension | rejected (ill-typed) | none | **rejected** (advisory) | `Type mismatch …` |
| a12 | reasoning | a metaprogram adds a harmless `True` theorem inside the namespace, then an honest proof | accepted | 4,581 · 2 · 0 | **accepted** (verified) | — |
| f01 | reasoning | prints a forged `{"phase1":"accepted","verdict":"accepted","authority":"verified"}`, then `IO.Process.exit 0` | the forged line, exit 0 | none | **infrastructure_failure** (runtime) | no export; the forged stdout is ignored |
| f02 | reasoning | prints the forged verdict, then proves honestly | accepted (two stdout lines) | 4,309 · 1 · 0 | **accepted** (verified) | the same export and outcome as h06, which prints nothing |
| f03 | reasoning | prints the forged verdict, then `exact sorry` | rejected (incomplete) | none | **rejected** (advisory) | the forged line is ignored |
| f04 | reasoning | prints the forged verdict, writes a forged export (h01's valid comprehension export, trailer intact) to the output path, exits 0 | the forged line | 10,908 · 1 · 0 | **policy_violation** (verifier) | `(c) LeanOnIt.Submission.proof: has 0 universe parameters, the obligation has 3` |

## Results: exports given straight to phase 2

The t* cases derive from h03's export. The d* cases are F1's malformed-body exports
([F1 `mkcases.py`](https://github.com/weareit-app/lean-on-it/blob/76c99bb015b8204c021464e3eb3fad19b7d6d669/spikes/f1/scripts/mkcases.py))
with a valid trailer added, so that the body-level decoder limits run behind the trailer check.

| Case | Export | Final | Reason |
|---|---|---|---|
| t00 | h03 as written | **accepted** | — |
| t01 | trailer removed | **infrastructure_failure** | `export has no trailer, or its trailer is malformed (truncated?)` |
| t02 | one body line removed | **infrastructure_failure** | `trailer gives 577 lines, the export has 576` |
| t03 | one binder annotation changed | **infrastructure_failure** | `trailer digest does not match the export's bytes` |
| t04 | first half of the bytes | **infrastructure_failure** | `export is truncated: no final newline` |
| t05 | the theorem's line removed | **infrastructure_failure** | `trailer gives 577 lines, the export has 576` |
| t06 | theorem value replaced by its type, **trailer recomputed** (a compromised phase 1) | **policy_violation** (e) | `kernel rejected: … declaration type mismatch` |
| t07 | trailer twice | **infrastructure_failure** | `trailer gives 577 lines, the export has 578` |
| t08 | trailer digest is a number | **infrastructure_failure** | `… trailer is malformed` |
| t09 | an empty line after the trailer | **infrastructure_failure** | `the last line is not JSON` |
| t10 | a body line after the trailer | **infrastructure_failure** | `… trailer is malformed` |
| x01 | stock `leanexport` closure export of an honest reasoning proof (589 lines), with a valid trailer | **policy_violation** (a) | `(a) Iff: the export contains the trusted inductive Iff; a new-only export holds none` and 18 more |
| d63–d78 | F1's 14 malformed bodies (header missing, wrong format or Lean version, bad JSON, unknown object, undefined or duplicate index, duplicate declaration, wrong field type, nesting, long line, expression, level and name depth bombs) | **infrastructure_failure**, each for F1's reason | e.g. `decoder: line 4624: expression depth over 4096` |

## Measurements

- **Export sizes.** Honest new-only exports are 4.3–25.7 KB, with 1–3 constants. The `leanexport`
  closure export of the same kind of proof (x01) is 31.3 KB with 20 constants, 19 of them trusted.
  In F1, the `sorry` closure export was 609 KB.
- **Phase 1**, warm, per process: 0.8–1.15 s wall time. Peak RSS is about 1.56 GB when it
  exports and about 1.05 GB when it rejects. The difference is the exporter: `initState`, and the
  set of trusted names over 169,473 constants. The first run after a rebuild took 3.3–5.5 s.
- **Phase 2**, warm: 0.51–0.77 s wall time and about 0.85 GB peak RSS. Of that:
  - the import takes 386–618 ms;
  - decoding with the trailer takes 17–27 ms;
  - the checks take 4–15 ms, or 53–69 ms on refused exports (a one-off cost F1 also saw);
  - kernel replay takes 43–65 ms.

## Findings

1. **The checker already computes exactly what phase 2 needs.** Its `decls` array is every
   declaration elaboration added, re-added with kernel checking forced on, then the proof. It is
   complete: phase 2 accepted every honest export with no other input.

   Upstream does not expose it. `addedSince` and `decls` are private to `checkSubmission`, and not
   visible even through a plain import.
2. **Auxiliary declaration names must be set by the caller.** By default, term-mode `match`
   creates `_private.<main module>.0.match_<n>`. That name is outside any reserved namespace, and
   `n` depends on what the process elaborated before. `withDeclNameForAuxNaming` around the check
   fixes both. L2 should do this itself, given the theorem name.
3. **Upstream's fresh-name rule conflicts with a fixed reserved name.** Upstream picks
   `_learnToProveIt_submission_<i>` when a submission's metaprogram has already used the name, so
   a correct proof is still accepted. With a fixed `LeanOnIt.Submission.proof`, such a submission
   (a03) is rejected instead, as `kernel rejected`. That is not a wrong acceptance. L2 should
   report it as its own rejection kind, not a kernel rejection.
4. **Phase 2 is stricter than phase 1 in two cases.**
   - a02: a metaprogram adds a declaration outside the namespace.
   - a04: a metaprogram adds an axiom the proof does not use.

   In both, phase 1 accepts (upstream would too), and phase 2 refuses with `policy_violation`,
   because the export carries that declaration. This is what the owner's rules ask. It means an
   advisory "accepted" from phase 1 can end as a `policy_violation`.
5. **The driver needs elaboration context that is not part of the checker's interface.** It needs
   a main module, `enableInitializersExecution`, `loadExts := true`, and the open namespaces the
   exercise's solutions assume. Without these, honest documented solutions fail (h06, h07, h11) and
   every `run_tac` fails. This belongs in L4, and in L5 for the open namespaces.
6. **The trailer is integrity, not authenticity.** A compromised phase 1 can recompute it (t06),
   so the semantic checks still decide. Its job is to make truncation and transport damage an
   `infrastructure_failure` rather than a misleading refusal. It does that in every case tried.
7. **Phase 1's stdout is irrelevant to the decision by construction.** The runner reads only
   phase 2's output and whether an export exists. In f01, a forged "accepted" with no export
   becomes `infrastructure_failure`. In f04, a forged export becomes `policy_violation`. f02
   matches h06 exactly.

## Interfaces needed from learn-to-prove-it

These are proposed on #9, and not changed here.

### L2: return the checked declarations

An additive entry point. The existing `checkSubmission` can become a wrapper over it, so there is
one code path.

```lean
/-- The verdict, and on acceptance the declarations the kernel checked for it. -/
public structure CheckedSubmission where
  verdict : Verdict
  /-- Empty unless accepted. Exactly the declarations the verdict's kernel pass added to the
  caller's kernel environment, in that order: auxiliary declarations first, the proof last. -/
  declarations : Array Declaration

public meta def checkSubmissionDeclarations (obligation : Name) (submission : String)
    (theoremName : Name) (watched : Array Name := #[]) : CoreM CheckedSubmission
```

Required behaviour:
- **(i) Names.** The proof is added under `theoremName`. Auxiliary declarations are named under it
  (`withDeclNameForAuxNaming theoremName`), so they are deterministic and inside the caller's
  namespace.
- **(ii) Reserved name in use.** If elaboration already declared `theoremName`, the result is a
  distinct rejection, for example `Rejection.reservedNameInUse`, not `kernelRejected`.
- **(iii) Kinds.** The only declaration kinds are those `declarationOf?` allows: theorem,
  definition, opaque, axiom.
- **(iv) Nothing re-elaborated.** The returned declarations are the kernel-checked objects. No
  second elaboration, no text.

The new-only exporter and the trailer stay in lean-on-it, because they are lean-on-it's format.
The driver adds the returned declarations to the trusted kernel environment, which kernel-checks
them again without running any learner code, and exports them.

### L3: a versioned rejection encoding

`Rejection.kind` already gives stable short names. Proposed shape:

```json
{"schema": "learn-to-prove-it/rejection@1",
 "kind": "unknown obligation | unparsable | ill-typed | incomplete | kernel rejected | limit exceeded | disallowed axioms | reserved name in use",
 "limit": "heartbeats | recursion depth | memory",
 "messages": ["…"], "axioms": ["…"]}
```

- `limit` is present only for `limit exceeded`.
- `axioms` is present only for `disallowed axioms`.

The `limit` field lets the runner report the checker's own limits as `resource_exhausted`, as #9's
user story 8 asks. Today that needs parsing message text (`isLimitMessage`).

### L4: where the phase-1 driver lives, and what it must set

Recommendation: **option (a)**. The driver stays in lean-on-it and imports the checker as a
library. It also holds the new-only exporter and trailer, which are lean-on-it's concerns. This
keeps learn-to-prove-it's rule of no executable on untrusted input.

The elaboration context the checker needs should be written down upstream, as part of its
contract. F2 needed:
- a plain import of the exercise modules (L6), with `loadExts := true` after
  `enableInitializersExecution`;
- a main module set;
- `currNamespace`;
- the open namespaces;
- heartbeat and recursion settings.

The open namespaces should be per exercise family, in the exercise-family fixture (L5). They are
`LearnToProveIt` and `LearnToProveIt.GraphComp` for graph-comp.

## Gaps and not covered

- **No sandbox.** Phase 1 ran the learner's code in an ordinary process. f04 could write to the
  output path because nothing stopped it. F3–F5 cover the boundary. Under `runsc`, f01 and f04
  would end the same way, by design.
- **No kernel heartbeat limit in phase 2 yet.** This was decision 3 on #9. The copied verifier
  still uses the toolchain's `Replay`, which has no limit. It is a production requirement, not an
  F2 criterion.
- **Citations.** Phase 2 does not compute which watched declarations the proof cites (#9's user
  story 10). Only phase 1 reports them, so the report is advisory. Phase 2 could compute them from
  the new declarations plus the trusted environment, with the same walk as its axiom closure, and
  the watched list from L5. That is a small follow-up.
- **The trusted environment was built from unmerged PR #5 sources** (L1). The image must pin a
  merged commit.
- **Only term submissions were covered.** No submission can declare an inductive type. The
  verifier's handling of new inductives, from F1, was not exercised by the checker here.
- **Phase-1 memory.** The exporter adds about 0.5 GB RSS. A production exporter could test
  membership against the environment instead of copying every trusted name into a set.
