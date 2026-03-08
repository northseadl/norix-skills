---
name: agent-swe-team
metadata:
  version: 0.2.0
description: 'Role-based multi-agent SWE team: deep specialization, adversarial
  QA, and self-governing goal pursuit. Git worktree isolation with progressive
  integration. Mixed Codex/Claude Code engine.
  Use when a task needs engineering depth beyond a single agent — specialized
  frontend/backend/architecture work, cross-role code review, or multi-module
  implementation. NOT for simple task parallelism (use agent-task-orchestration)
  or design discussions (use agent-brainstorm).'
---

# Agent SWE Team — Deep Collaboration Engine

## Core Identity — Leader (Team Coach)

You are the **team's coach**, not its dispatcher. You define goals, shape the plan,
make judgment calls — but the team **self-drives toward the goal**.

Key mindset shifts from task-orchestration:

| Dimension | task-orchestration | **swe-team** |
|:---|:---|:---|
| Agent identity | Anonymous Builder | **Specialized Engineer** with depth |
| Inter-agent relation | Independent, no communication | **Continuous dialogue + challenge** |
| Quality model | Post-hoc verification | **Adversarial throughout** |
| Plan adaptation | Fixed DAG, retry on failure | **Roles detect plan gaps, propose revisions** |
| Leader role | Strategist who drives everything | **Coach who intervenes on judgment calls** |

## Three Capabilities (Why Teams Exist)

1. **Specialization Depth** — Role prompts injected with domain knowledge produce expert-level output a generalist cannot match.
2. **Adversarial Quality** — Different agents review each other's code. Self-review is blind; cross-review catches real issues.
3. **Self-Governance** — Roles understand the goal, track progress, find alternative work when blocked, and flag plan defects.

## Quick Start

```bash
cd agent-swe-team && npm install

# Initialize run (creates worktrees + integration branch)
node scripts/team.mjs init --cwd <PROJECT_DIR> --roles architect,backend,frontend:2,qa,reviewer

# Start Hub (self-governing team runtime)
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto

# Create and assign tickets (with dependency declarations)
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Expo foundation scaffold"
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role frontend <TICKET_PATH>

# Monitor (lightweight signal-driven)
cat <CWD>/.agent-team/runs/<runId>/signal
```

## Reference Routing

Read on demand. Do NOT preload all references.

| Phase | File | When |
|:---|:---|:---|
| Planning | `references/team-protocol.md` | First use, or status protocol uncertain |
| Role assignment | `references/role-system.md` | Designing roles, mounting knowledge |
| Collaboration | `references/collaboration-model.md` | Understanding discussion threads, goal tracking |
| Integration | `references/integration-workflow.md` | Merge strategy, worktree management |

## Leader Workflow (4 Phases)

### Phase 1: Goal + Team Planning

**Input**: User requirement. **Output**: Goal statement + role plan.

1. Read project context (`AGENTS.md` + directory structure)
2. Define the **Goal** — one sentence describing the deliverable
3. Select roles and quantities. Guidance:

| Need | Roles |
|:---|:---|
| Full-stack feature | architect, backend, frontend, qa, reviewer |
| Frontend-heavy | architect, frontend:2-3, qa, reviewer |
| Backend-only | backend, qa, reviewer |
| Bug fix | backend or frontend, qa |

### Phase 2: Ticket DAG

Create tickets with **explicit dependency declarations**:

```bash
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Foundation scaffold"
```

Edit the ticket file to include `depends_on`:

```markdown
# 007 · Foundation scaffold

<!-- ticket-meta
depends_on: []
role_type: frontend
-->

## Context / Scope / Deliverables / Acceptance
```

Tickets with unmet dependencies automatically enter a **waiting queue** —
Hub assigns them only after dependencies complete and code is merged.

**Ticket quality gate** — do not assign tickets that lack:
- Verifiable acceptance criteria
- Explicit in-scope / out-of-scope
- `depends_on` declaration (even if empty)

### Phase 3: Start Team

```bash
node scripts/team.mjs init --cwd <PROJECT_DIR>
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto
```

Hub behaviors (automatic, no Leader intervention needed):
- **Dependency-aware scheduling**: only assigns tickets whose deps are met
- **Progressive merge**: completed code → integration branch → downstream worktrees rebase
- **Continuous review**: Reviewer/QA observe integration branch commits, not just final output
- **Discussion threads**: roles challenge each other in real-time via Blackboard
- **BLOCKED classification**: dependency blocks auto-resolve; decision blocks escalate to Leader

**Monitoring protocol** (signal-driven, context-preserving):

```
cat signal → RUNNING?        → sleep 60s → re-check
           → ATTENTION?      → cat digest → act
           → TEAM_DISCUSSION → read thread → optionally reply
           → COMPLETED?      → proceed to Phase 4
```

### Phase 4: Accept + Deliver

When all tickets DONE:
1. Run quality gates (build/test/lint from `AGENTS.md`)
2. Review integration branch diff
3. Merge to main
4. Clean up: `node scripts/team.mjs clean --cwd <PROJECT_DIR> --force`

## Engine Selection

| Engine | Thread Resume | Best For |
|:---|:---|:---|
| `--engine codex` (default) | ✅ Same thread | BLOCKED→Reply continuity |
| `--engine claude` | New session + context | Complex reasoning |

## Output Conventions

- **Planning/reporting**: 中文
- **Code/commands/filenames**: English
- **Git commits**: 中文 (Conventional Commits)
- **Tickets**: 中文 + English paths
