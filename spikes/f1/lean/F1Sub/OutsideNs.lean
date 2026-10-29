/- F1 spike, NON-PRODUCTION. Case: a new declaration outside the reserved namespace.
Expected: refused by (b). -/
import F1Trusted

open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem Learner.helper {α : Type u} {β : Type v} {γ : Type w} (f : α → β)
    (r : β → γ → Prop) (a : α) (c : γ) :
    Relation.Comp (fun x y => f x = y) r a c ↔ r (f a) c :=
  ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, h⟩⟩

theorem LeanOnIt.Submission.proof : obligation.{u, v, w} :=
  fun f r a c => Learner.helper f r a c
