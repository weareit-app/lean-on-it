/- F2 spike, NON-PRODUCTION. An honest reasoning proof as an ordinary declaration, so that the
stock `leanexport` writes it with its whole dependency closure. Case x01: F2's check (a) must
refuse such an export, because it contains trusted-named constants. -/
import LearnToProveIt.GraphComp.Reasoning

universe u v w

theorem LeanOnIt.Submission.proof : LearnToProveIt.GraphComp.Reasoning.obligation.{u, v, w} :=
  fun f r a c => LearnToProveIt.graph_comp_iff f r a c
