/-
F2 spike, NON-PRODUCTION. A new-only exporter in format 3.1.0, built on the toolchain's
`LeanExport.Basic`.

It runs `LeanExport.dumpConstant` with every constant of the trusted (base) environment already
marked as visited, so the dependency walk writes no trusted constant: only the given new
declarations, with the names, levels and expressions they use. The header is `leanexport`'s own
(format and Lean versions). A closing trailer gives the line count and SHA-256 of every byte
before it:

  {"trailer":{"lines":<lines before the trailer>,"sha256":"<hex>"}}
-/
import LeanExport.Basic
import F2.Sha256

open Lean

namespace F2

/-- The export of `names` from `env`, skipping every constant `base` has, with the trailer. -/
def newOnlyExport (env base : Environment) (names : Array Name) : IO ByteArray := do
  let trusted : NameHashSet := base.constants.fold (fun s n _ => s.insert n) {}
  let buf ← IO.mkRef ({} : IO.FS.Stream.Buffer)
  IO.withStdout (IO.FS.Stream.ofBuffer buf) do
    LeanExport.M.run env do
      LeanExport.initState env
      modify fun st => { st with visitedConstants := trusted }
      LeanExport.dumpMetadata
      for n in names do
        modify fun st => { st with noMDataExprs := {} }
        LeanExport.dumpConstant n
  let body := (← buf.get).data
  let lines : Nat := body.foldl (fun n b => if b == 10 then n + 1 else n) 0
  let trailer := Json.mkObj [("trailer", Json.mkObj [("lines", lines), ("sha256", Sha256.hex body)])]
  return body ++ (trailer.compress ++ "\n").toUTF8

end F2
