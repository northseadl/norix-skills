---
name: agent-team-dev
version: 0.0.1
description: |
  Build large software tasks with an "agent team" development model: one Leader agent (primary user interface)
  dispatches tickets to multiple role-based Codex sub-agents (architect/backend/frontend/qa/reviewer) through a
  local Hub service. Use when you want: role-based delegation, SWE-team-like collaboration, local hub/server,
  ticket assignment + reply loop (BLOCKED -> reply -> continue), git worktree isolation per role, or Codex SDK
  integration for multi-role development.

  Also trigger for: "agent team", "team mode", "leader + 多 agent", "角色分工", "模拟软件团队",
  "本地协作中枢", "git worktree 隔离", "派发工单", "reply 回灌", "TEAM_STATUS=BLOCKED",
  "Codex SDK orchestrate roles".
---

# Agent Team Dev (1:1:n Leader-Team)

## Quick Start

Install deps:

```bash
cd <SKILLS_DIR>/agent-team-dev && npm install
```

Create a run (creates `.agent-team/` runtime data under your project; does not edit your project `.gitignore`):

```bash
node scripts/team.mjs init --cwd <PROJECT_DIR>
```

Start the Hub (dashboard + queue worker):

```bash
node scripts/team.mjs serve --cwd <PROJECT_DIR>
```

Create a ticket:

```bash
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Implement OAuth login"
```

Assign a ticket to a role:

```bash
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <PROJECT_DIR>/.agent-team/tickets/001-implement-oauth-login.md
```

If a role reports `TEAM_STATUS=BLOCKED`, reply and continue:

```bash
node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow. Store tokens in Keychain. No refresh token."
```

Poll low-cost status:

```bash
node scripts/team.mjs status --cwd <PROJECT_DIR>
cat <PROJECT_DIR>/.agent-team/runs/<runId>/signal
cat <PROJECT_DIR>/.agent-team/runs/<runId>/digest.txt
```

## Leader Workflow (Fixed)

1. Run `init` to create a run + role worktrees/branches.
2. Run `serve` to start the Hub service (dashboard + queue workers).
3. Split the big goal into role-written tickets (one role per ticket).
4. Use `assign` to dispatch tickets in parallel.
5. Poll `signal/digest`. When a role outputs `TEAM_STATUS=BLOCKED`, use `reply` to make a decision and unblock them.
6. When roles are `DONE/NEEDS_REVIEW`, merge role branches into an integration branch (Leader responsibility).
7. Run the project's quality gate (build/test/lint as appropriate).
8. Optionally assign a final `reviewer` ticket for last-pass review.
9. Optionally `clean --force` to remove worktrees and run data.

## Safety Rules

- Do not commit `.agent-team/` into your project repo. Add it to project `.gitignore` manually:
  - `echo ".agent-team/" >> <PROJECT_DIR>/.gitignore`
- Do not hardcode credentials in tickets/prompts.
- Use git worktrees per role to reduce conflicts. Do not edit outside the role's worktree directory.

## Dry-Run Validation

Use `--dry-run` to validate queue + state + reporting without calling Codex or running `git worktree add/remove`:

```bash
node scripts/team.mjs init --cwd <PROJECT_DIR> --dry-run
node scripts/team.mjs serve --cwd <PROJECT_DIR> --dry-run --no-open
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Test ticket"
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <PROJECT_DIR>/.agent-team/tickets/001-test-ticket.md
node scripts/team.mjs status --cwd <PROJECT_DIR>
```

## References

- Protocol: `references/protocol.md`
- Role templates: `references/roles/*.md`
