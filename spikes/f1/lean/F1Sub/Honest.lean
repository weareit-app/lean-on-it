/- F1 spike, NON-PRODUCTION. Case: honest proof. Expected: accepted. -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem proof : obligation.{u, v, w} := by
  intro α β γ f r a c
  constructor
  · rintro ⟨b, rfl, h⟩
    exact h
  · intro h
    exact ⟨f a, rfl, h⟩

end LeanOnIt.Submission
