/- F1 spike, NON-PRODUCTION. Size of the trusted environment the verifier loads: modules,
constants and the bytes of every .olean part (.olean, .olean.server, .olean.private). -/
import Lean
open Lean

def main : IO Unit := do
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := `F1Trusted }] {}
  let mut bytes : Nat := 0
  let mut mathlib : Nat := 0
  for m in env.header.moduleNames do
    let f ← findOLean m
    for p in [f, OLeanLevel.server.adjustFileName f, OLeanLevel.private.adjustFileName f] do
      if ← p.pathExists then
        let n := (← p.metadata).byteSize.toNat
        bytes := bytes + n
        if (`Mathlib).isPrefixOf m then mathlib := mathlib + n
  IO.println s!"modules={env.header.moduleNames.size} constants={env.constants.toList.length} oleanBytes={bytes} mathlibOleanBytes={mathlib}"
