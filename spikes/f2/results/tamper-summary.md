| Case | Export | Expected | Observed | Result | Reason (verifier output) |
|---|---|---|---|---|---|
| `d63-header-missing` | F1 case 63-header-missing, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export format null is not the pinned 3.1.0 |
| `d64-wrong-format-version` | F1 case 64-wrong-format-version, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export format "3.0.0" is not the pinned 3.1.0 |
| `d65-wrong-lean-version` | F1 case 65-wrong-lean-version, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export is from Lean "4.34.0", not the pinned 4.35.0 |
| `d66-invalid-json` | F1 case 66-invalid-json, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 265 is not JSON: offset 18: unexpected end of input |
| `d67-unknown-object` | F1 case 67-unknown-object, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: LeanExport parser: Unknown export object with keys [foo] |
| `d68-undefined-index` | F1 case 68-undefined-index, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: LeanExport parser: Expr not found 1000000 |
| `d69-duplicate-index` | F1 case 69-duplicate-index, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: LeanExport parser: Expr index 0 bound twice |
| `d70-duplicate-declaration` | F1 case 70-duplicate-declaration, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: LeanExport parser: Duplicate declaration: LeanOnIt.Submission.proof |
| `d71-wrong-field-type` | F1 case 71-wrong-field-type, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: LeanExport parser: thmInfo invalid |
| `d73b-nested-json-short` | F1 case 73b-nested-json-short, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 265 nests JSON deeper than 6 |
| `d74-long-line` | F1 case 74-long-line, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 265 is 70043 bytes, over the 65536-byte limit |
| `d76-expr-depth-bomb` | F1 case 76-expr-depth-bomb, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 4624: expression depth over 4096 |
| `d77-level-depth-bomb` | F1 case 77-level-depth-bomb, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 784: universe level depth over 256 |
| `d78-name-depth-bomb` | F1 case 78-name-depth-bomb, with a valid trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: line 656: name depth over 128 |
| `t00-untouched` | h03's export as phase 1 wrote it | accepted | **accepted** (verified)  | pass |  |
| `t01-no-trailer` | trailer line removed | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export has no trailer, or its trailer is malformed (truncated?) |
| `t02-line-removed` | one body line removed, trailer kept | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: trailer gives 577 lines, the export has 576 |
| `t03-byte-altered` | one binder annotation changed, trailer kept | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: trailer digest does not match the export's bytes |
| `t04-truncated-mid-line` | first half of the bytes | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export is truncated: no final newline |
| `t05-theorem-line-removed` | the theorem's line removed, trailer kept | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: trailer gives 577 lines, the export has 576 |
| `t06-altered-trailer-recomputed` | theorem value replaced by its type, trailer recomputed (a compromised phase 1) | policy_violation:e | **policy_violation** (verifier) e | pass | (e) LeanOnIt.Submission.proof: kernel rejected: while replaying declaration 'LeanOnIt.Submission.proof':
(kernel) declaration type mismatch, 'LeanOnIt.Submission.proof' has type
  Prop
but it is expec |
| `t07-duplicate-trailer` | trailer twice | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: trailer gives 577 lines, the export has 578 |
| `t08-malformed-trailer` | trailer digest is a number | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export has no trailer, or its trailer is malformed (truncated?) |
| `t09-blank-after-trailer` | an empty line after the trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export has no trailer: the last line is not JSON (truncated?) |
| `t10-line-after-trailer` | a body line after the trailer | infrastructure_failure | **infrastructure_failure** (verifier)  | pass | decoder: export has no trailer, or its trailer is malformed (truncated?) |
| `x01-closure-export` | stock leanexport closure export of an honest proof, with a valid trailer | policy_violation:a | **policy_violation** (verifier) a | pass | (a) Iff: the export contains the trusted inductive Iff; a new-only export holds none; (a) Iff.intro: the export contains the trusted constructor Iff.intro; a new-only export holds none; … 17 more |
