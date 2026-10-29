/- F1 spike, NON-PRODUCTION. Case: a different (weaker) statement, one direction only.
Expected: refused by (c). -/
import F1Trusted

namespace LeanOnIt.Submission
universe u v w

theorem proof : ∀ {α : Type u} {β : Type v} {γ : Type w} (f : α → β) (r : β → γ → Prop)
    (a : α) (c : γ), r (f a) c → Relation.Comp (fun x y => f x = y) r a c :=
  fun f _ a _ h => ⟨f a, rfl, h⟩

end LeanOnIt.Submission
