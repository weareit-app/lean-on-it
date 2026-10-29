/- F1 spike, NON-PRODUCTION. Case: proof via an axiom declared in the submission.
Expected: refused by (d). -/
import F1Trusted

namespace LeanOnIt.Submission
open LearnToProveIt.GraphComp.Reasoning
universe u v w

axiom cheat : obligation.{u, v, w}

theorem proof : obligation.{u, v, w} := cheat

end LeanOnIt.Submission
