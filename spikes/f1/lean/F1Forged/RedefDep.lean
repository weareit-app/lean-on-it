/- F1 spike, NON-PRODUCTION. Case: the export brings its own `Relation.Comp`.
Core only, no Mathlib, so the forged constant has the trusted name. The obligation's text is
the trusted one, so its exported body is structurally identical to the trusted body; only
`Relation.Comp` differs. Expected: refused by (a) on `Relation.Comp`. -/
universe u_1 u_2 u_3

/-- FORGED: universal, not existential. -/
def Relation.Comp {α : Type u_1} {β : Type u_2} {γ : Type u_3}
    (r : α → β → Prop) (p : β → γ → Prop) (a : α) (c : γ) : Prop :=
  ∀ b, r a b → p b c

namespace LearnToProveIt.GraphComp.Reasoning
universe u v w

def obligation : Prop :=
  ∀ {α : Type u} {β : Type v} {γ : Type w} (f : α → β) (r : β → γ → Prop) (a : α) (c : γ),
    Relation.Comp (fun x y => f x = y) r a c ↔ r (f a) c

end LearnToProveIt.GraphComp.Reasoning

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

theorem proof : obligation.{u, v, w} := fun f r a _ =>
  ⟨fun h => h (f a) rfl, fun h _ hb => hb ▸ h⟩

end LeanOnIt.Submission
