/-
F2 spike, NON-PRODUCTION. Phase-1 driver: runs the (labelled copy of the) learn-to-prove-it
checker on a submission, once, and writes a new-only export of exactly the declarations the
checker kernel-checked for an accepted proof.

  f2phase1 <exercise-id> <submission.lean-term> <out.ndjson>

Everything this process prints is advisory: it runs the learner's code. Only phase 2's verifier
decides acceptance.
-/
import F2.CheckerL2
import F2.NewOnlyExport

open Lean LearnToProveIt

/-- Trusted configuration: the pinned exercises. In #9 this comes from the exercise-family
fixture (`fixtures/prove-how/graph-comp.exercise-family.json`, L5). -/
def exercises : List (String × Name) := [
  ("graph-comp.comprehension", `LearnToProveIt.GraphComp.Comprehension.obligation),
  ("graph-comp.reasoning", `LearnToProveIt.GraphComp.Reasoning.obligation),
  ("graph-comp.transfer", `LearnToProveIt.GraphComp.Transfer.obligation)]

def envModules : Array Name :=
  #[`LearnToProveIt.GraphComp.Comprehension, `LearnToProveIt.GraphComp.Reasoning,
    `LearnToProveIt.GraphComp.Transfer]

def reservedNs : Name := `LeanOnIt.Submission
def theoremName : Name := reservedNs ++ `proof

def verdictJson : Verdict → Json
  | .accepted axs cited complete => Json.mkObj [("phase1", "accepted"),
      ("axioms", toJson (axs.map toString)), ("cited", toJson (cited.map toString)),
      ("citationsComplete", complete)]
  | .rejected r => Json.mkObj [("phase1", "rejected"), ("kind", r.kind), ("detail", (repr r).pretty)]

unsafe def main (args : List String) : IO UInt32 := do
  let [exId, subPath, outPath] := args | do
    IO.eprintln "usage: f2phase1 <exercise-id> <submission> <out.ndjson>"; return 2
  let some obligation := exercises.lookup exId | do
    IO.eprintln s!"unknown exercise {exId}"; return 2
  let text ← IO.FS.readFile subPath
  initSearchPath (← findSysroot)
  enableInitializersExecution
  let env ← importModules (envModules.map ({ module := · })) {} (loadExts := true)
  -- As Lean's frontend does: without a main module, `run_tac` and other compile-time evaluation
  -- fail with "Environment.realizeConst: `realizedImportedConsts` is empty".
  let env := env.setMainModule `LeanOnItF2Submission
  let opts : Options := maxHeartbeats.set {} 200000
  let ctx : Core.Context := {
    fileName := "<submission>"
    fileMap := FileMap.ofString text
    options := opts
    currNamespace := reservedNs
    -- The scope learn-to-prove-it's own tests and exercise docs assume: `open LearnToProveIt GraphComp`.
    openDecls := [.simple `LearnToProveIt [], .simple `LearnToProveIt.GraphComp []]
    maxHeartbeats := 200000 * 1000 }
  let exported ← IO.mkRef (none : Option ByteArray)
  let check : CoreM Verdict := withDeclNameForAuxNaming theoremName <|
    checkSubmission obligation text (theoremName? := some theoremName)
      (onAccepted := fun decls => do
        let names := decls.flatMap (·.getNames.toArray)
        exported.set (some (← F2.newOnlyExport (← getEnv) env names)))
  let (verdict, _) ← check.toIO ctx { env }
  if verdict.isAccepted then
    if let some bytes ← exported.get then IO.FS.writeBinFile outPath bytes
  IO.println (verdictJson verdict).compress
  return 0
