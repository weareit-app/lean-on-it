/- F1 spike, NON-PRODUCTION. Honest proof through a helper lemma in the reserved namespace.
Expected: accepted. Also the base that `mkcases.py` renames for the name-collision cases. -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem helper {α : Type u} {β : Type v} {γ : Type w} (f : α → β) (r : β → γ → Prop)
    (a : α) (c : γ) : Relation.Comp (fun x y => f x = y) r a c ↔ r (f a) c :=
  ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, h⟩⟩

theorem proof : obligation.{u, v, w} := fun f r a c => helper f r a c

end LeanOnIt.Submission
