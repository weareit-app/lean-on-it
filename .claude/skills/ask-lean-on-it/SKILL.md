---
name: ask-lean-on-it
description: Ask which skill or flow fits your situation. The one list of this repo's skills and when to use each.
disable-model-invocation: true
---

# Ask lean-on-it

The owner asked which skill or flow fits. Answer from this map, then name the exact command to type (Claude Code: `/name`; Codex: `$name`).

The summaries here are for routing only. Before you state what a skill does, or recommend skipping a step, read that skill's `SKILL.md`. Where a vendored skill's text and this repo's docs differ (for example, it writes to `docs/adr/`), the repo's docs win: decisions live in `docs/architecture/decisions.md`.

## Main flow: a change to what lean-on-it does

- **`/grill-with-docs`** sharpens the idea by interview and records terms in `GLOSSARY.md`. **`/grill-me`** is the same interview with no paper trail. Both run **`/grilling`**, the interview primitive.
- **`/to-spec`** turns the settled idea into a spec in the issue tracker (`docs/agents/issue-tracker.md`); **`/implement-spec`** builds from it.
- **`/to-tickets`** splits work into agent-ready tickets, for parallel sessions or people.
- **`/implement`** or **`/tdd`** does the work; **`/code-review`** reviews it against the spec and `AGENTS.md`; **`/pr`** shapes the PR body.
- **`/retro`** closes the loop after a build: mechanical mistakes become checks, judgement calls become rules.

## On-ramps

- **A question that needs a runnable answer**: **`/prototype`**, with **`/handoff`** to move to and from its own directory.
- **Something broken, flaky, or slow**: **`/diagnosing-bugs`**, then `/retro` in the same session.
- **Raw issues and requests from others**: **`/triage`**.
- **Work too big and foggy for one session**: **`/wayfinder`** charts decision tickets; when the fog clears, it hands off to `/to-spec`.

## Codebase health

- **`/improve-codebase-architecture`** surveys for deepening opportunities; **`/codebase-design`** is the deep-module vocabulary; **`/domain-modeling`** sharpens terms in `GLOSSARY.md` and records decisions in `decisions.md`.

## Standalone

- **`/research`** sends reading to a background agent that leaves a cited Markdown file.
- **`/to-questionnaire`**, **`/wizard`**, **`/wait-what`**, **`/teach`** and **`/writing-for-agents`** as their descriptions say.
- **`/ask-matt`** is the upstream skills' own router; prefer this map.
- **`/setup-matt-pocock-skills`** has already been run here; rerun it only to change `docs/agents/`.
- **`/ask-lean-on-it`** is this map.
