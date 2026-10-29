-- Spike F3 (non-production). A small module that imports all of Mathlib.
import Mathlib

theorem f3_workload (a b : ℕ) : a + b = b + a := Nat.add_comm a b

example : (2 : ℝ) + 2 = 4 := by norm_num
