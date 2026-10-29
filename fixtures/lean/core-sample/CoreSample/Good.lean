-- A test fixture for lean-on-it's verifier: core Lean only, no Mathlib.

namespace CoreSample

/-- Adding zero on the right changes nothing. -/
theorem add_zero' (n : Nat) : n + 0 = n := rfl

/-- Uses `propext` through `simp`, an allowed axiom. -/
theorem and_self' (p : Prop) : (p ∧ p) = p := by simp

end CoreSample
