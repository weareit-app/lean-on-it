/- F1 spike, NON-PRODUCTION. Diagnostic: why `Expr.equal` cannot be used for check (a).
Prints, for a few trusted constants in an honest export, whether the exported type is
`Expr.equal` and `Expr.eqv` to the trusted one, and both binder-name lists. -/
import Lean
import LeanExport.Parse
open Lean

partial def binders : Expr → List String
  | .forallE n _ b bi => s!"{n}:{repr bi}" :: binders b
  | _ => []

/-- Removes `mdata` (enough for this diagnostic; the verifier uses a full normalisation). -/
partial def strip (e : Expr) : Expr :=
  e.replace fun | .mdata _ b => some (strip b) | _ => none

def main (args : List String) : IO Unit := do
  let [path] := args | throw <| .userError "usage: BinderDiag <export>"
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := `F1Trusted }] {}
  let exp ← IO.FS.withFile path .read fun h => LeanExport.parseStream (.ofHandle h)
  for n in [`Nat.add, `Not, `Nat.beq, `Nat.eq_of_beq_eq_true] do
    let some x := exp.constMap[n]? | continue
    let some t := env.find? n | continue
    IO.println s!"{n}: equal={t.type.equal x.type} eqv={t.type == x.type} eqvAfterStrippingMData={strip t.type == x.type}\n  trusted  {binders t.type}\n  exported {binders x.type}"
