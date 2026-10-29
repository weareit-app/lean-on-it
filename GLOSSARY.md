# lean-on-it

Evidence about Lean formalizations: what a formal statement is meant to say, what Lean actually checked, and whether an independent reviewer agrees the two match. Each kind of evidence keeps its own status.

## Evidence records

**Intended claim**:
The mathematical statement a formalization is meant to capture, with its source, the source's version and any stated assumptions. Distinct from any Lean declaration.
_Avoid_: theorem (ambiguous between the claim and its formal statement), spec

**Formal declaration**:
One fully qualified Lean declaration, its elaborated type, and the formal environment it was checked in.
_Avoid_: lemma, proof (the proof is the declaration's value, not the declaration)

**Formal environment**:
The pinned Lean toolchain, Lake and package revisions, and workspace revision a formal declaration is checked against.
_Avoid_: setup, build

**Verification run**:
One reproducible check of a formal declaration in its formal environment: the exact commands, their results, the declaration's axioms and dependency closure, and digests of every artifact produced. It says nothing about fidelity.
_Avoid_: build (a build is one possible step of a run), proof check

**Fidelity review**:
An independent reader's judgement of whether a formal declaration's elaborated type says what the intended claim says, with the reviewer's independence, a verdict, typed findings and stated limitations.
_Avoid_: verification, sign-off

**Finding**:
One typed discrepancy, or one point a reviewer could not settle, between an intended claim and an elaborated type.
_Avoid_: issue, comment

**Evidence manifest**:
The versioned, machine-readable bundle that holds one intended claim, one formal declaration, one verification run and any fidelity reviews, as separate records, with the statuses derived from them.
_Avoid_: certificate, report

## Statuses

**Kernel status**:
What the verification run established: kernel-checked, rejected, or incomplete. Derived from the run's records, never asserted.
_Avoid_: verified, green

**Kernel-checked**:
Lean's kernel accepted the declaration in its formal environment, using only allowed axioms, and the run captured its elaborated type, axioms and dependency closure.
_Avoid_: proven, correct

**Incomplete**:
The run could not gather some required evidence, so it claims neither success nor failure.
_Avoid_: unknown, pending

**Fidelity status**:
What the fidelity reviews established: not reviewed, approved, rejected, inconclusive, AI-screened, or stale. Derived from the reviews, never from the kernel status.
_Avoid_: verified, faithful (a verdict, not a status)

**Stale review**:
A fidelity review of an elaborated type other than the declaration's current one, which therefore no longer counts.

## Trust

**Trusted workspace**:
A Lean project inside a root the operator authorized when starting lean-on-it. Callers cannot add roots.
_Avoid_: sandbox (a trusted workspace is not isolated)

**Allowed axiom**:
An axiom the run's axiom policy accepts for kernel-checked status; by default Lean's `propext`, `Classical.choice` and `Quot.sound`.
