/- F1 spike, NON-PRODUCTION. Case: the export redefines the obligation as (essentially) `True`.
Core only. The theorem's type is the constant `obligation.{u,v,w}`, the same as the honest
proof's, so only (a) can tell. Expected: refused by (a) on `obligation`. -/
namespace LearnToProveIt.GraphComp.Reasoning
universe u v w

/-- FORGED. -/
def obligation : Prop := PUnit.{u+1} → PUnit.{v+1} → PUnit.{w+1} → True

end LearnToProveIt.GraphComp.Reasoning

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem proof : obligation.{u, v, w} := fun _ _ _ => trivial

end LeanOnIt.Submission
