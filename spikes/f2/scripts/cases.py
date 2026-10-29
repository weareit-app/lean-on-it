"""F2 spike, NON-PRODUCTION. Writes every submission (a Lean term, as learners submit it) to
build/cases/<case>.lean and the expectations to build/cases/cases.json.

`expect` is the final category the trusted runner must report:
  accepted                  phase 2 accepted (authority verified)
  rejected                  phase 1 rejected, no export (authority advisory)
  policy_violation:<checks> phase 2 refused, for those checks
  infrastructure_failure    phase 2 could not decode the export (or there was none)
Run with `python3 -I scripts/cases.py`.
"""

import json
import os

F2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(F2, "build", "cases")
FORGED = '{"phase1":"accepted","verdict":"accepted","authority":"verified"}'

C, R, T = "graph-comp.comprehension", "graph-comp.reasoning", "graph-comp.transfer"
HONEST_R = "fun f r a c => graph_comp_iff f r a c"

CASES = [
    # Honest submissions, all three exercises.
    ("h01-comprehension-tactic", C, "accepted", "honest, tactic proof",
     "by refine ⟨rfl, ?_, 7, rfl, fun _ h => h.symm⟩; intro h; cases h"),
    ("h02-comprehension-omega", C, "accepted", "honest, change and omega",
     "by\n  refine ⟨rfl, fun h => ?_, 7, rfl, fun _ h => h.symm⟩\n  change 2 * 3 + 1 = 8 at h\n  omega"),
    ("h03-reasoning-match", R, "accepted", "honest, term mode with match (auxiliary matchers)",
     "fun f r a c => ⟨fun ⟨_, hb, h⟩ => match hb with | rfl => h, fun h => ⟨f a, rfl, h⟩⟩"),
    ("h04-reasoning-simp", R, "accepted", "honest, simp (axioms propext, Quot.sound)",
     "by intro f r a c; simp [Relation.Comp]"),
    ("h05-reasoning-rintro", R, "accepted", "honest, rintro",
     "by\n  intro α β γ f r a c\n  constructor\n  · rintro ⟨b, rfl, h⟩\n    exact h\n  · intro h\n    exact ⟨f a, rfl, h⟩"),
    ("h06-reasoning-cites", R, "accepted", "honest, cites trusted graph_comp_iff", HONEST_R),
    ("h07-transfer-supplied-fact", T, "accepted", "honest, uses the supplied fact graph_comp_iff",
     "by refine ⟨fun x z => graph_comp_iff _ _ x z, ⟨4, rfl, by decide⟩, ?_⟩; "
     "rintro ⟨b, hb, h⟩; subst hb; exact absurd h (by decide)"),
    ("h08-transfer-direct", T, "accepted", "honest, without the supplied fact",
     "by\n  refine ⟨fun x z => ⟨fun ⟨_, hb, h⟩ => hb ▸ h, fun h => ⟨x, rfl, h⟩⟩, ⟨4, rfl, by decide⟩, ?_⟩\n"
     "  rintro ⟨b, hb, h⟩\n  subst hb\n  exact absurd h (by decide)"),
    ("h10-reasoning-doc", R, "accepted", "the valid solution in docs/exercises/graph-comp.md",
     "fun f r a c => ⟨fun ⟨b, hb, h⟩ => hb ▸ h, fun h => ⟨f a, rfl, h⟩⟩"),
    ("h11-transfer-doc", T, "accepted", "the valid solution in docs/exercises/graph-comp.md",
     "⟨fun x z => graph_comp_iff Subtype.val (· ∣ ·) x z, ⟨4, rfl, by decide⟩, "
     "fun ⟨b, hb, h⟩ => by subst hb; exact absurd h (by decide)⟩"),
    # Learner code runs exactly once, in phase 1.
    ("h09-runs-once", R, "accepted", "honest, with a metaprogram that reports each run on stderr",
     f'by (run_tac (IO.eprintln "F2-LEARNER-CODE-RAN" : IO Unit)); exact {HONEST_R}'),
    # Adversarial cases from LearnToProveItTest/Adversarial.lean (PR #5), and variants.
    ("a01-skip-kernel-tc", R, "rejected", "debug.skipKernelTC with a false decide +kernel lemma",
     "set_option debug.skipKernelTC true in\n  fun f r a c => absurd (by decide +kernel : (1 : Nat) = 2) (by decide)"),
    ("a02-upstream-reserved-name", R, "policy_violation:b",
     "declares upstream's _learnToProveIt_submission through a metaprogram, then proves honestly",
     "by (run_tac Lean.addDecl (.thmDecl { name := `_learnToProveIt_submission, "
     "levelParams := [], type := Lean.mkConst ``True, value := Lean.mkConst ``True.intro })); "
     f"exact {HONEST_R}"),
    ("a03-reserved-theorem-name", R, "rejected",
     "declares LeanOnIt.Submission.proof itself through a metaprogram",
     "by (run_tac Lean.addDecl (.thmDecl { name := `LeanOnIt.Submission.proof, "
     "levelParams := [], type := Lean.mkConst ``True, value := Lean.mkConst ``True.intro })); "
     f"exact {HONEST_R}"),
    ("a04-unused-axiom", R, "policy_violation:d",
     "a metaprogram adds an axiom the proof does not use",
     "by (run_tac Lean.addDecl (.axiomDecl { name := `LeanOnIt.Submission.cheat, "
     "levelParams := [], type := Lean.mkConst ``False, isUnsafe := false })); "
     f"exact {HONEST_R}"),
    ("a05-used-axiom", R, "rejected", "a metaprogram adds an axiom and the proof uses it",
     "by (run_tac Lean.addDecl (.axiomDecl { name := `LeanOnIt.Submission.cheat, "
     "levelParams := [], type := Lean.mkConst ``False, isUnsafe := false })); "
     "exact LeanOnIt.Submission.cheat.elim"),
    ("a06-let-rec", R, "rejected", "let rec",
     "fun f r a c => let rec g : Nat → Nat | 0 => 0 | n + 1 => g n; graph_comp_iff f r a c"),
    ("a07-recursion-limit", R, "rejected", "recursion-depth attack (maxRecDepth 40, 200 nested id)",
     "set_option maxRecDepth 40 in fun f r a c => " + "id (" * 200 + "graph_comp_iff f r a c" + ")" * 200),
    ("a08-caught-limit", R, "rejected", "a resource limit a tactic catches and logs",
     "have _ : (List.range 200).foldl (· + ·) 0 = 19900 := by decide\n  fun f r a c => graph_comp_iff f r a c"),
    ("a09-native-decide", R, "rejected", "native_decide",
     f"have _ : 2 + 2 = 4 := by native_decide\n  {HONEST_R}"),
    ("a10-sorry", R, "rejected", "sorry", "sorry"),
    ("a11-wrong-exercise", C, "rejected", "a reasoning proof submitted to comprehension", HONEST_R),
    ("a12-stray-decl-in-namespace", R, "accepted",
     "a metaprogram adds a harmless theorem inside the reserved namespace",
     "by (run_tac Lean.addDecl (.thmDecl { name := `LeanOnIt.Submission.extra, "
     "levelParams := [], type := Lean.mkConst ``True, value := Lean.mkConst ``True.intro })); "
     f"exact {HONEST_R}"),
    # Forged verdicts on stdout.
    ("f01-forged-exit", R, "infrastructure_failure",
     "prints a forged accepted verdict and exits 0 before the checker finishes",
     f'by (run_tac (do IO.println {json.dumps(FORGED)}; IO.Process.exit 0 : IO Unit)); exact {HONEST_R}'),
    ("f02-forged-then-honest", R, "accepted",
     "prints a forged accepted verdict, then proves honestly: the same outcome as without it",
     f'by (run_tac (IO.println {json.dumps(FORGED)} : IO Unit)); exact {HONEST_R}'),
    ("f03-forged-then-wrong", R, "rejected", "prints a forged accepted verdict, then gives no proof",
     f'by (run_tac (IO.println {json.dumps(FORGED)} : IO Unit)); exact sorry'),
    ("f04-forged-export", R, "policy_violation:c",
     "prints a forged verdict, writes a forged export (a valid comprehension proof) and exits 0",
     'by (run_tac (do IO.FS.writeBinFile "@OUT@" (← IO.FS.readBinFile "@COMP_EXPORT@"); '
     f'IO.println {json.dumps(FORGED)}; IO.Process.exit 0 : IO Unit)); exact {HONEST_R}'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for case, ex, expect, desc, text in CASES:
        with open(os.path.join(OUT, case + ".lean"), "w", encoding="utf-8") as f:
            f.write(text + "\n")
        meta[case] = {"exercise": ex, "expect": expect, "description": desc}
    with open(os.path.join(OUT, "cases.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    main()
