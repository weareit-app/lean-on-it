/-
F1 spike, NON-PRODUCTION. The pinned trusted environment for the spike.

COPY, clearly labelled: the `obligation` below is copied from
weareit-app/learn-to-prove-it PR #5, branch `claude/verified-exercise-graph-comp-26f20c`,
commit 75590c0c628162727fb3d60632e46a4cd4de5706, file
`LearnToProveIt/GraphComp/Reasoning.lean` (sha256 b81758cc…c299bc). Changes from the
original: plain (non-`module`) file, so `@[expose] public` is dropped; the reference solution
`solution` and `graph_comp_iff` are not copied, so a submission cannot simply cite them.
The statement and its namespace are unchanged.
-/
import Mathlib.Logic.Relation

namespace LearnToProveIt.GraphComp.Reasoning

universe u v w

/-- The proof obligation (copied, see the header). -/
def obligation : Prop :=
  ∀ {α : Type u} {β : Type v} {γ : Type w} (f : α → β) (r : β → γ → Prop) (a : α) (c : γ),
    Relation.Comp (fun x y => f x = y) r a c ↔ r (f a) c

end LearnToProveIt.GraphComp.Reasoning
