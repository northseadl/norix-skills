# Agent SWE Team Protocol (1:1:n)

## Architecture

```
User ─── requirement + constraints ─── can intervene anytime
  │
  ▼
Leader (you) ── product/arch decisions, ticket writing, merge, quality gate
  │
  ▼
Hub (local service) ── dispatch, per-role queue, event logging, dashboard
  │
  ▼
Role Agent(s) ── isolated execution in git worktrees ── report back via TEAM_STATUS
```

## Roles

- **Leader (you)**: Primary interface with the user. Owns product intent, architecture decisions, scope, ticket quality, BLOCKED decisions, branch integration, and final delivery.
- **Hub (Local Service)**: Dispatch and supervision center. Owns queueing, per-role execution (Codex or Claude), event logging, signal/digest/status, dashboard.
- **Role Agent(s)**: Sub-agents. Each role works in its own `git worktree` and branch. Communicates via structured reports and TEAM_STATUS protocol.

Default role set:
- `architect` — design decisions, interface contracts, module boundaries
- `backend` — server-side implementation, data access, tests
- `frontend` — UI implementation, interactions, component changes
- `qa` — verification, test coverage, edge cases, regressions
- `reviewer` — code review, bug detection, risk assessment

## Work Unit: Ticket

One ticket is assigned to exactly one role.

Ticket quality checklist (Leader must verify before assign):
- Exact file paths and commands when possible
- In-scope and out-of-scope explicitly listed
- Acceptance criteria are verifiable (command or observable behavior)
- Scope fits a single session (≤500 lines changed, ≤8 files)
- Role-specific hints provided (code style, existing patterns to follow)

## Status Protocol (machine-readable)

Role agent must end the final response with exactly one line:
- `TEAM_STATUS=DONE` — work completed, ready for review/merge
- `TEAM_STATUS=BLOCKED` — needs Leader decision to continue
- `TEAM_STATUS=NEEDS_REVIEW` — work done but wants Leader to check
- `TEAM_STATUS=FAILED` — unrecoverable error

Role agent must include a `## Report` block with:
- Ticket
- Role
- Branch
- Worktree
- Commits (list SHAs + subject)
- Tests (commands + PASS/FAIL)
- Notes (design decisions, edge cases, tradeoffs)
- Questions (if any)

### BLOCKED → Reply → Continue

If role agent is blocked, it must:
1. State the blocker clearly (1-3 sentences)
2. Provide 2-3 concrete options with tradeoffs
3. Ask the Leader to choose
4. End with `TEAM_STATUS=BLOCKED`

Leader responds using `reply --role <role> --text "...decision..."`, which is fed back to the same role (same thread for Codex, new session with full context for Claude), and the role continues.

## Git Worktree Discipline

- Each role works only in its own worktree directory
- Each role commits to its own branch: `team/<runId>/<role>`
- Hub does NOT auto-commit. Commit is a role responsibility
- Hub refuses to start a ticket if the role worktree is dirty (pre-check `git status --porcelain`)

## Integration (Leader responsibility)

After roles report `DONE/NEEDS_REVIEW`, Leader:
1. Creates an integration branch: `integration/<runId>`
2. Merges role branches in dependency order (architect → backend → frontend)
3. Resolves conflicts
4. Runs quality gates (build/test/lint commands from AGENTS.md)
5. Optionally assigns a reviewer ticket for last-pass review

## Engine Support

| Engine | Thread Resume | Best For |
|:---|:---|:---|
| Codex (`--engine codex`) | ✅ Same thread | BLOCKED→Reply continuity |
| Claude (`--engine claude`) | New session + full context | Complex reasoning tasks |
