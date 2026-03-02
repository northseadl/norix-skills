# Agent Team Dev Protocol (1:1:n)

## Roles

- **Leader (Strategist)**: Primary interface with the user. Owns product intent, architecture decisions, scope, acceptance, integration/merge, and final delivery.
- **Hub (Local Service)**: Dispatch and supervision center. Owns queueing, per-role execution, event logging, signal/digest/status, dashboard.
- **Role Agent(s)**: Codex sub-agents. Each role works in its own `git worktree` and branch.

Default role set:
- `architect`
- `backend`
- `frontend`
- `qa`
- `reviewer`

## Work Unit: Ticket

One ticket is assigned to exactly one role.

Ticket should be written like a real SWE team task:
- Provide exact file paths, commands, and references when possible.
- Keep scope tight. If a ticket feels like "a project", split it.
- Acceptance must be checkable (command or observable behavior).

## Status Protocol (machine-readable)

Role agent must end the final response with exactly one line:
- `TEAM_STATUS=DONE`
- `TEAM_STATUS=BLOCKED`
- `TEAM_STATUS=NEEDS_REVIEW`
- `TEAM_STATUS=FAILED`

Role agent must include a `## Report` block with:
- Ticket
- Role
- Branch
- Worktree
- Commits
- Tests
- Notes
- Questions (if any)

### BLOCKED -> Reply -> Continue

If role agent is blocked, it must:
- State the blocker clearly.
- Provide 2-3 concrete options.
- Ask Leader to choose.
- End with `TEAM_STATUS=BLOCKED`.

Leader responds using `reply --role <role> --text "...decision..."`, which is fed back to the same role thread, and the role continues.

## Git Worktree Discipline

- Each role works only in its own worktree directory.
- Each role commits to its own branch: `team/<runId>/<role>`.
- Hub does NOT auto-commit. Commit is a role responsibility.
- Hub refuses to start a ticket if the role worktree is dirty (pre-check `git status --porcelain`).

## Integration (Leader responsibility)

After roles report `DONE/NEEDS_REVIEW`, Leader:
- Merges role branches into an integration branch/worktree.
- Resolves conflicts and runs quality gates (build/test/lint).
- Optionally assigns a reviewer ticket for last-pass review.

