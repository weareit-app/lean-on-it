# Agent skills

How agents run the repo's skills. `AGENTS.md` points here; `/ask-lean-on-it` lists them and when to use each.

## Editing a skill

Edit the skill in `.claude/skills`, then run `node tools/skills-sync/sync-skills.mjs` to copy it to `.agents/skills`, the folder Codex reads. The check (`--check`) fails while the two differ.

The vendored Matt Pocock skills stay unmodified. Where one's text differs from this repo's docs (for example, it writes decisions to `docs/adr/`), the repo's docs win: decisions live in `docs/architecture/decisions.md`.

## Manual-only skills

Skills whose `SKILL.md` sets `disable-model-invocation: true` (such as `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, and `/retro`) start only when the owner types them. When a flow reaches one, give the owner the exact command to type.
