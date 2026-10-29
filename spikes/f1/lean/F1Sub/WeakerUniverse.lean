/- F1 spike, NON-PRODUCTION. Case: a weaker statement, the obligation at universe 0 only.
Expected: refused by (c). -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning

theorem proof : obligation.{0, 0, 0} := fun f r a c =>
  ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, h⟩⟩

end LeanOnIt.Submission
