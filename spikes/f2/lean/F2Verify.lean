/-
F2 spike, NON-PRODUCTION. COPY of the F1 verifier (`spikes/f1/verifier/F1Verify.lean` on branch
`spike/f1-trusted-replay`, commit 76c99bb015b8204c021464e3eb3fad19b7d6d669, sha256
3f745a31dc5763dff042a377423eff4bf4fec9f3dc2d2835734225fefd80b6b6), adapted for F2. Every change is
marked `-- F2:` and listed in `spikes/f2/verifier-f2.diff`:

- the trailer is checked before anything is parsed (line count and SHA-256 of every byte before
  it), and stripped before the toolchain parser runs;
- check (a) is the owner's stricter rule of 2026-10-28: the export contains no trusted-named
  constant at all;
- the trusted environment is learn-to-prove-it's three graph-comp modules, and the obligation is
  chosen by a pinned exercise id;
- results use the owner's categories: `accepted` (authority `verified`), `policy_violation` and
  `infrastructure_failure` (authority `verifier`).

The F1 description follows, with (a) as amended above.

It loads the pinned trusted environment, decodes an export (format 3.1.0) with the toolchain's
`LeanExport` parser under size and structure limits, and decides from the trusted environment
plus the export's *new* declarations only:

- (a) every exported constant whose name exists in the trusted environment is structurally
  identical to the trusted one. The export's copy is then discarded, never used;
- (b) every new name lies strictly inside the reserved submission namespace and collides with
  no trusted name, public or private;
- (c) the submitted theorem's type is exactly the obligation, compared in the trusted
  environment;
- (d) the export declares no axioms, and the theorem's axiom closure, computed with trusted
  constants for every trusted name, is within `propext`, `Classical.choice`, `Quot.sound`;
- (s) structure: no unsafe, partial or quotient new declarations, and every new inductive,
  constructor and recursor belongs to a new inductive block that the export gives in full;
- (e) the kernel accepts the new declarations, added on top of the trusted kernel environment.
  Run only when (a)–(d) and (s) pass, so that the kernel never sees a refused export.

Prints one JSON line. Exit status: 0 accepted, 1 refused, 2 infrastructure failure.
-/
import Lean
import LeanExport.Parse
import F2.Sha256

open Lean

namespace F2V

/-- Trusted configuration. In #9's design this comes from the pinned exercise fixture,
never from the export or the client. -/
structure Config where
  -- F2: learn-to-prove-it's graph-comp modules; the obligation is set from the exercise id.
  envModules : Array Name := #[`LearnToProveIt.GraphComp.Comprehension,
    `LearnToProveIt.GraphComp.Reasoning, `LearnToProveIt.GraphComp.Transfer]
  obligation : Name := .anonymous
  theoremName : Name := `LeanOnIt.Submission.proof
  reservedNs : Name := `LeanOnIt.Submission
  permittedAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]
  formatVersion : String := "3.1.0"
  maxBytes : Nat := 8 * 1024 * 1024
  maxLineBytes : Nat := 64 * 1024
  maxLines : Nat := 1_000_000
  maxJsonNesting : Nat := 6
  maxExprDepth : Nat := 4096
  maxLevelDepth : Nat := 256
  maxNameDepth : Nat := 128
  maxConstants : Nat := 100_000
  maxNewConstants : Nat := 256

structure Reason where
  check : String
  name : Name
  detail : String

def Reason.toJson (r : Reason) : Json :=
  Json.mkObj [("check", r.check), ("name", r.name.toString), ("detail", r.detail)]

/-- Raised for anything that makes the export undecodable. Reported as an infrastructure
failure, never as a rejection of the mathematics. -/
def decodeError (msg : String) : IO α :=
  throw <| .userError s!"decoder: {msg}"

/-! ## Decoding under limits -/

structure DecodeStats where
  bytes : Nat := 0
  lines : Nat := 0
  maxLineBytes : Nat := 0
  maxExprDepth : Nat := 0
  maxLevelDepth : Nat := 0
  maxNameDepth : Nat := 0

/-- JSON nesting depth of one line, scanned without recursion. Run before any JSON parser,
so that a deeply nested line cannot overflow a recursive parser's stack. -/
def jsonNesting (line : String) : Nat := Id.run do
  let mut depth := 0
  let mut maxDepth := 0
  let mut inStr := false
  let mut esc := false
  for c in line.toList do
    if inStr then
      if esc then esc := false
      else if c == '\\' then esc := true
      else if c == '"' then inStr := false
    else if c == '"' then inStr := true
    else if c == '[' || c == '{' then
      depth := depth + 1
      maxDepth := max maxDepth depth
    else if c == ']' || c == '}' then
      depth := depth - 1
  return maxDepth

def childIdxs (data : Json) (keys : List String) : List Nat :=
  keys.filterMap fun k => match data.getObjVal? k with
    | .ok (.num (n : Nat)) => some n
    | _ => none

/-- Depth of the node a line defines, from the depths of the earlier nodes it refers to. -/
def lineDepth (obj : Json) : Option (String × Nat × List Nat) := do
  let kv ← match obj with | .obj kv => some kv | _ => none
  let idxOf (k : String) : Option Nat := match kv.get? k with
    | some (.num (n : Nat)) => some n
    | _ => none
  if let some i := idxOf "in" then
    let pre := (["str", "num"].filterMap fun k => kv.get? k).flatMap (childIdxs · ["pre"])
    return ("in", i, pre)
  if let some i := idxOf "il" then
    let kids := match kv.get? "succ", kv.get? "max", kv.get? "imax" with
      | some (.num (n : Nat)), _, _ => [n]
      | _, some (.arr #[.num (a : Nat), .num (b : Nat)]), _ => [a, b]
      | _, _, some (.arr #[.num (a : Nat), .num (b : Nat)]) => [a, b]
      | _, _, _ => []
    return ("il", i, kids)
  if let some i := idxOf "ie" then
    let kids :=
      (kv.get? "app").map (childIdxs · ["fn", "arg"]) <|>
      (kv.get? "lam").map (childIdxs · ["type", "body"]) <|>
      (kv.get? "forallE").map (childIdxs · ["type", "body"]) <|>
      (kv.get? "letE").map (childIdxs · ["type", "value", "body"]) <|>
      (kv.get? "proj").map (childIdxs · ["struct"]) <|>
      (kv.get? "mdata").map (childIdxs · ["expr"])
    return ("ie", i, kids.getD [])
  none

/-- Checks size, encoding, framing, header and nesting limits, then hands the bytes to the
toolchain's `LeanExport` parser. Any failure is a decoder error. -/
def decode (cfg : Config) (path : System.FilePath) : IO (LeanExport.ExportedEnv × DecodeStats) := do
  let md ← try path.metadata catch e => decodeError s!"cannot stat export: {e}"
  if md.byteSize.toNat > cfg.maxBytes then
    decodeError s!"export is {md.byteSize} bytes, over the {cfg.maxBytes}-byte limit"
  let bytes ← IO.FS.readBinFile path
  if bytes.size > cfg.maxBytes then
    decodeError s!"export grew past the {cfg.maxBytes}-byte limit while reading"
  let some text := String.fromUTF8? bytes | decodeError "export is not valid UTF-8"
  if text.isEmpty then decodeError "export is empty"
  if !text.endsWith "\n" then decodeError "export is truncated: no final newline"
  -- F2: the trailer, checked before any other line is parsed. It counts and digests every byte
  -- before it, so truncation or alteration anywhere is detected.
  let allLines := (text.splitOn "\n").dropLast
  let some last := allLines.getLast? | decodeError "export is empty"
  if last.utf8ByteSize > cfg.maxLineBytes || jsonNesting last > cfg.maxJsonNesting then
    decodeError "export has no trailer: the last line is over the line limits"
  let trailer ← match Json.parse last with
    | .ok j => pure (j.getObjValD "trailer")
    | .error _ => decodeError "export has no trailer: the last line is not JSON (truncated?)"
  let (.ok (n : Nat), .ok (digest : String)) :=
      (trailer.getObjValAs? Nat "lines", trailer.getObjValAs? String "sha256")
    | decodeError "export has no trailer, or its trailer is malformed (truncated?)"
  let bodyBytes := bytes.extract 0 (bytes.size - last.utf8ByteSize - 1)
  let lines := allLines.dropLast
  if n != lines.length then
    decodeError s!"trailer gives {n} lines, the export has {lines.length}"
  if F2.Sha256.hex bodyBytes != digest then
    decodeError "trailer digest does not match the export's bytes"
  if lines.length > cfg.maxLines then
    decodeError s!"export has {lines.length} lines, over the {cfg.maxLines}-line limit"
  let mut st : DecodeStats := { bytes := bytes.size, lines := lines.length }
  let mut depth : Std.HashMap (String × Nat) Nat := {}
  let mut first := true
  let mut lineNo := 0
  for line in lines do
    lineNo := lineNo + 1
    let n := line.utf8ByteSize
    st := { st with maxLineBytes := max st.maxLineBytes n }
    if n > cfg.maxLineBytes then
      decodeError s!"line {lineNo} is {n} bytes, over the {cfg.maxLineBytes}-byte limit"
    if jsonNesting line > cfg.maxJsonNesting then
      decodeError s!"line {lineNo} nests JSON deeper than {cfg.maxJsonNesting}"
    let json ← match Json.parse line with
      | .ok j => pure j
      | .error e => decodeError s!"line {lineNo} is not JSON: {e}"
    if first then
      first := false
      let fmt := json.getObjValD "meta" |>.getObjValD "format" |>.getObjValD "version"
      let lean := json.getObjValD "meta" |>.getObjValD "lean" |>.getObjValD "version"
      unless fmt == .str cfg.formatVersion do
        decodeError s!"export format {fmt.compress} is not the pinned {cfg.formatVersion}"
      unless lean == .str Lean.versionString do
        decodeError s!"export is from Lean {lean.compress}, not the pinned {Lean.versionString}"
      continue
    if let some (kind, idx, kids) := lineDepth json then
      let d := 1 + kids.foldl (fun m k => max m (depth.getD (kind, k) 0)) 0
      depth := depth.insert (kind, idx) d
      match kind with
      | "ie" =>
        st := { st with maxExprDepth := max st.maxExprDepth d }
        if d > cfg.maxExprDepth then
          decodeError s!"line {lineNo}: expression depth over {cfg.maxExprDepth}"
      | "il" =>
        st := { st with maxLevelDepth := max st.maxLevelDepth d }
        if d > cfg.maxLevelDepth then
          decodeError s!"line {lineNo}: universe level depth over {cfg.maxLevelDepth}"
      | _ =>
        st := { st with maxNameDepth := max st.maxNameDepth d }
        if d > cfg.maxNameDepth then
          decodeError s!"line {lineNo}: name depth over {cfg.maxNameDepth}"
  if first then decodeError "export has no header line"
  let buf ← IO.mkRef ({ data := bodyBytes, pos := 0 } : IO.FS.Stream.Buffer) -- F2: without trailer
  let exp ← try LeanExport.parseStream (IO.FS.Stream.ofBuffer buf)
    catch e => decodeError s!"LeanExport parser: {e}"
  if exp.constMap.size > cfg.maxConstants then
    decodeError s!"export has {exp.constMap.size} constants, over the {cfg.maxConstants} limit"
  -- `leanexport` writes a constant's dependencies before the constant, so the submitted
  -- theorem is the last line. Truncation at a line boundary therefore always drops it: an
  -- export without it is incomplete, an infrastructure failure, not a refusal.
  unless exp.constMap.contains cfg.theoremName do
    decodeError s!"export is incomplete: it has no {cfg.theoremName}"
  return (exp, st)

/-! ## Normalisation of trusted constants

`leanexport` strips `mdata` and sets every `letE`'s `nondep` flag to `false`
(`LeanExport.Basic.removeMData`). The trusted side gets exactly the same normalisation before
the comparison in (a). The export side is never normalised: an export that carries `mdata` or
`nondep := true` on a trusted constant is refused. -/

partial def normExpr (e : Expr) : StateM (Std.HashMap ExprStructEq Expr) Expr := do
  if let some r := (← get)[(⟨e⟩ : ExprStructEq)]? then return r
  let r ← match e with
    | .mdata _ b => normExpr b
    | .app f a => return e.updateApp! (← normExpr f) (← normExpr a)
    | .lam _ d b _ => return e.updateLambdaE! (← normExpr d) (← normExpr b)
    | .forallE _ d b _ => return e.updateForallE! (← normExpr d) (← normExpr b)
    | .letE n t v b _ => return .letE n (← normExpr t) (← normExpr v) (← normExpr b) false
    | .proj _ _ s => return e.updateProj! (← normExpr s)
    | _ => return e
  modify (·.insert ⟨e⟩ r)
  return r

def norm (e : Expr) : Expr := (normExpr e).run' {}

/-- `none` when the exported constant is structurally identical to the (normalised) trusted
one; otherwise the first difference. Expressions are compared with `Expr.eqv` (`==`):
alpha-equivalence, ignoring binder names and binder annotations. Stricter `Expr.equal` is not
usable: `leanexport` hash-conses expressions with `==`, so an export may carry another,
alpha-equivalent expression's binder names (observed on `Nat.add`, `PProd.rec`, …). Binder names
and annotations are invisible to the kernel. -/
def constDiff (t x : ConstantInfo) : Option String :=
  let eq (a b : Expr) := norm a == b
  let chk (c : Bool) (what : String) : Option String := if c then none else some what
  chk (t.name == x.name) "name" <|> chk (t.levelParams == x.levelParams) "levelParams" <|>
  chk (eq t.type x.type) "type" <|>
  match t, x with
  | .axiomInfo t, .axiomInfo x => chk (t.isUnsafe == x.isUnsafe) "isUnsafe"
  | .defnInfo t, .defnInfo x =>
    chk (eq t.value x.value) "value" <|> chk (t.hints == x.hints) "hints" <|>
    chk (t.safety == x.safety) "safety" <|> chk (t.all == x.all) "all"
  | .thmInfo t, .thmInfo x => chk (eq t.value x.value) "value" <|> chk (t.all == x.all) "all"
  | .opaqueInfo t, .opaqueInfo x =>
    chk (eq t.value x.value) "value" <|> chk (t.isUnsafe == x.isUnsafe) "isUnsafe" <|>
    chk (t.all == x.all) "all"
  | .quotInfo t, .quotInfo x => chk (t.kind == x.kind) "kind"
  | .inductInfo t, .inductInfo x =>
    chk (t.numParams == x.numParams && t.numIndices == x.numIndices && t.all == x.all &&
      t.ctors == x.ctors && t.numNested == x.numNested && t.isRec == x.isRec &&
      t.isUnsafe == x.isUnsafe && t.isReflexive == x.isReflexive) "inductive header"
  | .ctorInfo t, .ctorInfo x =>
    chk (t.induct == x.induct && t.cidx == x.cidx && t.numParams == x.numParams &&
      t.numFields == x.numFields && t.isUnsafe == x.isUnsafe) "constructor header"
  | .recInfo t, .recInfo x =>
    chk (t.all == x.all && t.numParams == x.numParams && t.numIndices == x.numIndices &&
      t.numMotives == x.numMotives && t.numMinors == x.numMinors && t.k == x.k &&
      t.isUnsafe == x.isUnsafe && t.rules.length == x.rules.length) "recursor header" <|>
    chk ((t.rules.zip x.rules).all fun (a, b) =>
      a.ctor == b.ctor && a.nfields == b.nfields && eq a.rhs b.rhs) "recursor rules"
  | _, _ => some "kind of declaration"

/-! ## The checks -/

structure Outcome where
  reasons : Array Reason := #[]
  trustedNamed : Nat := 0
  newNames : Array Name := #[]
  axiomClosure : Array Name := #[]
  kernelMs : Nat := 0
  kernelRan : Bool := false

def kindOf : ConstantInfo → String
  | .axiomInfo _ => "axiom" | .defnInfo _ => "def" | .thmInfo _ => "theorem"
  | .opaqueInfo _ => "opaque" | .quotInfo _ => "quot" | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor" | .recInfo _ => "recursor"

/-- Axioms reachable from `root`. A trusted name is always resolved in the trusted
environment; only a name the trusted environment lacks is resolved in the export. -/
def axiomClosure (env : Environment) (new : Std.HashMap Name ConstantInfo) (root : Name) :
    Array Name := Id.run do
  let mut seen : NameHashSet := {}
  let mut todo := #[root]
  let mut axs : NameSet := {}
  while h : todo.size > 0 do
    let n := todo[todo.size - 1]
    todo := todo.pop
    if seen.contains n then continue
    seen := seen.insert n
    let some ci := env.find? n <|> new[n]? | continue
    if ci matches .axiomInfo _ then axs := axs.insert n
    let mut deps := ci.getUsedConstantsAsSet.toArray
    if let .inductInfo v := ci then deps := deps ++ v.ctors.toArray
    todo := todo ++ deps
  return axs.toArray.qsort Name.lt

def check (cfg : Config) (env : Environment) (exp : LeanExport.ExportedEnv)
    (trustedUserNames : NameHashSet) : IO Outcome := do
  let mut out : Outcome := {}
  let refuse (o : Outcome) (check : String) (name : Name) (detail : String) : Outcome :=
    { o with reasons := o.reasons.push { check, name, detail } }
  let mut new : Std.HashMap Name ConstantInfo := {}
  -- (a) F2: a new-only export contains no trusted-named constant at all.
  for n in exp.constOrder do
    let some x := exp.constMap[n]? | continue
    match env.find? n with
    | some t =>
      out := { out with trustedNamed := out.trustedNamed + 1 }
      out := refuse out "a" n
        s!"the export contains the trusted {kindOf t} {n}; a new-only export holds none"
    | none =>
      new := new.insert n x
      out := { out with newNames := out.newNames.push n }
  if new.size > cfg.maxNewConstants then
    out := refuse out "s" .anonymous
      s!"{new.size} new declarations, over the {cfg.maxNewConstants} limit"
  -- (b) names and (s) structure of the new declarations.
  for n in out.newNames do
    let some x := new[n]? | continue
    if !(cfg.reservedNs.isPrefixOf n && n != cfg.reservedNs) then
      out := refuse out "b" n s!"new {kindOf x} outside the reserved namespace {cfg.reservedNs}"
    let user := privateToUserName n
    if env.contains user || trustedUserNames.contains user then
      out := refuse out "b" n s!"collides with the trusted name {user}"
    if isPrivateName n then
      out := refuse out "b" n "new declaration has a private name"
    if x.isUnsafe || x.isPartial then
      out := refuse out "s" n s!"new {kindOf x} is unsafe or partial"
    match x with
    | .quotInfo _ => out := refuse out "s" n "new quotient declaration"
    | .inductInfo v =>
      for m in v.all do
        unless new[m]? matches some (.inductInfo _) do
          out := refuse out "s" n s!"inductive block member {m} is not a new inductive"
      for c in v.ctors do
        match new[c]? with
        | some (.ctorInfo cv) =>
          unless cv.induct == n do
            out := refuse out "s" n s!"constructor {c} belongs to {cv.induct}"
        | _ => out := refuse out "s" n s!"constructor {c} is not a new constructor"
    | .ctorInfo v =>
      match new[v.induct]? with
      | some (.inductInfo iv) =>
        unless iv.ctors.contains n do
          out := refuse out "s" n s!"not listed by its inductive {v.induct}"
      | _ => out := refuse out "s" n s!"constructor of {v.induct}, which is not a new inductive"
    | .recInfo v =>
      for m in v.all do
        unless new[m]? matches some (.inductInfo _) do
          out := refuse out "s" n s!"recursor of {m}, which is not a new inductive"
    | _ => pure ()
  -- (c) the theorem states exactly the obligation, taken from the trusted environment.
  let some (.defnInfo obl) := env.find? cfg.obligation
    | throw <| .userError s!"configuration: obligation {cfg.obligation} is not a trusted definition"
  match new[cfg.theoremName]? with
  | none => out := refuse out "c" cfg.theoremName "the export has no submitted theorem of this name"
  | some (.thmInfo thm) =>
    let us := thm.levelParams.map Level.param
    if thm.levelParams.length != obl.levelParams.length then
      out := refuse out "c" cfg.theoremName
        s!"has {thm.levelParams.length} universe parameters, the obligation has {obl.levelParams.length}"
    else
      let body := norm (obl.value.instantiateLevelParams obl.levelParams us)
      let asConst := Expr.const cfg.obligation us
      unless thm.type == body || thm.type == asConst do
        out := refuse out "c" cfg.theoremName
          "its type is neither the obligation's body nor the obligation itself, at the theorem's own universe parameters"
  | some x => out := refuse out "c" cfg.theoremName s!"is a {kindOf x}, not a theorem"
  -- (d) axioms.
  for n in out.newNames do
    if new[n]? matches some (.axiomInfo _) then
      out := refuse out "d" n "the export declares an axiom"
  if new.contains cfg.theoremName then
    let axs := axiomClosure env new cfg.theoremName
    out := { out with axiomClosure := axs }
    for a in axs do
      unless cfg.permittedAxioms.contains a do
        out := refuse out "d" a "the theorem's axiom closure contains a non-permitted axiom"
  -- (e) the kernel, only for an export that passed everything above.
  if out.reasons.isEmpty then
    let t0 ← IO.monoMsNow
    out := { out with kernelRan := true }
    try
      let kenv ← env.toKernelEnv.replay new
      match kenv.find? cfg.theoremName with
      | some (.thmInfo t) =>
        unless t.type.equal (new[cfg.theoremName]!.type) do
          out := refuse out "e" cfg.theoremName "kernel environment holds a different theorem"
      | _ => out := refuse out "e" cfg.theoremName "theorem missing after kernel replay"
    catch e =>
      out := refuse out "e" cfg.theoremName s!"kernel rejected: {e}"
    out := { out with kernelMs := (← IO.monoMsNow) - t0 }
  return out

/-- User-facing names of the trusted environment's private constants, and a guard that the
trusted environment does not already use the reserved namespace. -/
def trustedNames (cfg : Config) (env : Environment) : IO NameHashSet := do
  let mut users : NameHashSet := {}
  for (n, _) in env.constants.toList do
    let user := privateToUserName n
    if cfg.reservedNs.isPrefixOf user then
      throw <| .userError s!"configuration: trusted constant {n} uses the reserved namespace"
    if isPrivateName n then users := users.insert user
  return users

-- F2: the owner's categories and authorities (#9, 2026-10-28).
def emit (verdict : String) (fields : List (String × Json)) : IO Unit :=
  let authority := if verdict == "accepted" then "verified" else "verifier"
  IO.println <| Json.compress <| Json.mkObj <|
    [("verdict", (verdict : Json)), ("authority", authority), ("verifier", "f2-spike")] ++ fields

def run (cfg : Config) (path : System.FilePath) : IO UInt32 := do
  let t0 ← IO.monoMsNow
  initSearchPath (← findSysroot)
  let env ← importModules (cfg.envModules.map ({ module := · })) {}
  let users ← trustedNames cfg env
  let t1 ← IO.monoMsNow
  let envStats := Json.mkObj [("modules", env.header.moduleNames.size),
    ("constants", env.constants.toList.length), ("importMs", t1 - t0)]
  let (exp, ds) ← match ← (decode cfg path).toBaseIO with
    | .ok r => pure r
    | .error e => do
      emit "infrastructure_failure" [("error", toString e), ("trustedEnv", envStats)]
      return 2
  let t2 ← IO.monoMsNow
  let out ← check cfg env exp users
  let t3 ← IO.monoMsNow
  let accepted := out.reasons.isEmpty && out.kernelRan
  emit (if accepted then "accepted" else "policy_violation") [ -- F2
    ("reasons", Json.arr (out.reasons.map Reason.toJson)),
    ("axiomClosure", Json.arr (out.axiomClosure.map (Json.str ·.toString))),
    ("kernelRan", out.kernelRan),
    ("export", Json.mkObj [("bytes", ds.bytes), ("lines", ds.lines),
      ("maxLineBytes", ds.maxLineBytes), ("maxExprDepth", ds.maxExprDepth),
      ("maxLevelDepth", ds.maxLevelDepth), ("maxNameDepth", ds.maxNameDepth),
      ("constants", exp.constMap.size), ("trustedNamed", out.trustedNamed),
      ("new", Json.arr (out.newNames.map (Json.str ·.toString)))]),
    ("trustedEnv", envStats),
    ("ms", Json.mkObj [("import", t1 - t0), ("decode", t2 - t1), ("checks", t3 - t2 - out.kernelMs),
      ("kernel", out.kernelMs), ("total", t3 - t0)])]
  return if accepted then 0 else 1

-- F2: the pinned exercises (trusted configuration; in #9, from the exercise-family fixture).
def exercises : List (String × Name) := [
  ("graph-comp.comprehension", `LearnToProveIt.GraphComp.Comprehension.obligation),
  ("graph-comp.reasoning", `LearnToProveIt.GraphComp.Reasoning.obligation),
  ("graph-comp.transfer", `LearnToProveIt.GraphComp.Transfer.obligation)]

end F2V

def main (args : List String) : IO UInt32 := do
  let [exId, path] := args | do
    IO.eprintln "usage: f2verify <exercise-id> <export.ndjson>"
    return 2
  let some obligation := F2V.exercises.lookup exId | do
    F2V.emit "infrastructure_failure" [("error", s!"unknown exercise {exId}")]
    return 2
  try F2V.run { obligation } path
  catch e => do
    F2V.emit "infrastructure_failure" [("error", toString e)]
    return 2
