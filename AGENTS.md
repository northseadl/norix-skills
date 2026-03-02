# AGENTS.md — norix-skills (Repository Map)

> This file is intentionally short. Treat it as a table of contents, not an encyclopedia.
> Deep rules and conventions live in `.agent/AGENTS.md`.

## What This Repo Is

This repository contains installable AI agent skills (each skill is a folder with `SKILL.md`, optional `references/`, and executable `scripts/`).

## Non-Negotiables (Read First)

- Work on `develop`. Do not commit directly to `main`.
- Only merge `develop -> main` via `--no-ff`. Never merge `main -> develop`.
- Enable repo hooks once per clone:
  - `git config core.hooksPath .githooks`

## Where The Truth Lives

- Repo rules and versioning: `.agent/AGENTS.md`
- Repo "brains" (for local agents working in this workspace):
  - `.agent/rules/soul.md` (cross-project principles)
  - `.agent/rules/domain.md` (this repo's current truth)
- Skill catalog: `README.md`
- Git workflow notes: `GIT_WORKFLOW.md`



## When Working On A Skill

- Open the skill's `SKILL.md` first; follow its trigger/scope boundaries.
- Prefer adding reusable, deterministic helpers into `scripts/` rather than writing long inline code blocks.
- Keep `references/` as the long-form source of truth; keep `SKILL.md` as a workflow + navigation file.

## If You Need More Detail

Open `.agent/AGENTS.md` and follow it as the authoritative policy document for this repository.
