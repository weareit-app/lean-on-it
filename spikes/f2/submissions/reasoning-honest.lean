fun f r a c => ⟨fun ⟨_, hb, h⟩ => match hb with | rfl => h, fun h => ⟨f a, rfl, h⟩⟩
