/- F1 spike, NON-PRODUCTION. Honest proof that declares its own inductive type in the reserved
namespace. Expected: accepted. Also the base that `mkcases.py` mutates for the structure case. -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

/-- A witness package, to exercise new inductives, constructors and recursors. -/
inductive Wit {β : Type v} {γ : Type w} (r : β → γ → Prop) (c : γ) : β → Prop
  | mk (b : β) (h : r b c) : Wit r c b

theorem proof : obligation.{u, v, w} := fun f r a c =>
  have back : Wit r c (f a) → r (f a) c := fun w => by cases w; assumption
  ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, (back (Wit.mk _ h))⟩⟩

end LeanOnIt.Submission
