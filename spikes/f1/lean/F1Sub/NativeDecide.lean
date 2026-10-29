/- F1 spike, NON-PRODUCTION. Case: proof that uses `native_decide`. In Lean 4.35.0
`native_decide` no longer goes through `Lean.ofReduceBool`: it adds an auxiliary axiom
(`<decl>._native.native_decide.ax_…`). Expected: refused by (d). -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem proof : obligation.{u, v, w} := by
  have _h : 2 + 2 = 4 := by native_decide
  intro α β γ f r a c
  exact ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, h⟩⟩

end LeanOnIt.Submission
