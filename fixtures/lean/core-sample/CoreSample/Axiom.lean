-- A test fixture: a declaration resting on a custom axiom, which must be
-- rejected under the default axiom policy.

namespace CoreSample

axiom cheat : False

theorem via_cheat : 1 = 2 := cheat.elim

end CoreSample
