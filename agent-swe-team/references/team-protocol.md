# Team Protocol

> Communication, status, and ticket conventions for the SWE Team runtime.

## TEAM_STATUS Protocol

Every role session ends with exactly one line: `TEAM_STATUS=<STATUS>`

| Status | Meaning | Hub Behavior |
|:---|:---|:---|
| `DONE` | Ticket complete, ready for merge | Auto-merge → integration branch |
| `BLOCKED` | Cannot proceed | Classify → auto-resolve or escalate |
| `NEEDS_REVIEW` | Work complete but wants human check | Notify Leader, hold merge |
| `FAILED` | Unrecoverable error | Log error, notify Leader |

## BLOCKED Classification

When a role reports BLOCKED, the Hub classifies the reason:

### Dependency Block (auto-resolved)

The role needs code/artifacts from another ticket that is not yet done.

```
BLOCKED: app/ directory does not exist.
Required by: ticket 003 → depends_on: [007]
Ticket 007 status: RUNNING (frontend-1)
```

Hub action: move ticket to **waiting queue**. When 007 completes and merges,
Hub auto-assigns 003 with updated worktree.

### Decision Block (escalated to Leader)

The role needs a product or architecture judgment call.

```
BLOCKED: UX ambiguous — tab navigation vs stack navigation.
Options:
  A: Tab navigation (standard mobile, simpler state)
  B: Stack navigation (matches web H5 precedent)
  C: Hybrid (tabs + nested stacks per tab)
Recommendation: A
```

Hub action: write to `signal`, wait for Leader reply.

### Role Report Format

```markdown
## Report

- **Ticket**: 007 · Foundation scaffold
- **Role**: frontend-1
- **Branch**: team/20260307-222202/frontend-1
- **Worktree**: .agent-team/worktrees/20260307-222202/frontend-1
- **Commits**:
  - abc1234 feat: create Expo app skeleton with router
  - def5678 feat: add theme tokens and base components
- **Tests**: `pnpm tsc --noEmit` → PASS
- **Notes**: Created 24 files. Used expo-router file-based routing.
- **Discussion**: Challenged architect's proposed flat route structure — see thread #3
- **Questions**: None

TEAM_STATUS=DONE
```

## Ticket Format

Tickets are Markdown files with embedded structured metadata.

```markdown
# <ID> · <Title>

<!-- ticket-meta
depends_on: [007]
role_type: frontend
estimate: M
priority: 1
-->

## Goal Context

What is the team-level goal this ticket advances?

## Context

Background and motivation for this work.

## Scope

- **In-scope**: ...
- **Out-of-scope**: ...

## Deliverables

- [ ] File/component list with acceptance criteria

## Acceptance

- [ ] Verifiable condition 1
- [ ] Verifiable condition 2

## Dependencies

- **blocked-by**: 007 (foundation must exist before feature implementation)
```

### Ticket Metadata Fields

| Field | Required | Values | Description |
|:---|:---|:---|:---|
| `depends_on` | Yes | `[]` or `[ticketId, ...]` | Tickets that must be DONE before this starts |
| `role_type` | Yes | architect/backend/frontend/qa/reviewer | Role type to assign |
| `estimate` | No | S/M/L | Expected effort |
| `priority` | No | 1-5 | Higher number = lower priority |

## Signal Protocol

The Hub writes to `signal` file for Leader consumption:

| Signal | Meaning | Leader Action |
|:---|:---|:---|
| `RUNNING` | All roles active, no issues | Wait |
| `ATTENTION role=<R> blocked` | Decision block needs Leader | Reply |
| `TEAM_DISCUSSION thread=<N>` | Role raised plan-level concern | Review + optionally participate |
| `COMPLETED` | All tickets done | Proceed to acceptance |
| `MERGE_CONFLICT role=<R>` | Auto-merge failed | Manual resolution |

## Structured Output Sections

Roles may include these `##` sections. Hub extracts and shares via Blackboard:

| Section | Extracted By | Shared With |
|:---|:---|:---|
| `## Contracts` | All roles | Cross-role type exclusion |
| `## API Surface` | Backend/Architect | Frontend, QA |
| `## Decisions` | Architect | All |
| `## Findings` | QA/Reviewer | Affected role |
| `## Breaking Changes` | Any | All |
| `## Plan Revision` | Any | Leader (for approval) |

### Plan Revision Format

Any role can propose a plan change:

```markdown
## Plan Revision

**Observation**: Features in ticket 003 require Foundation (007) to exist,
but 003 was assigned before 007 completed.

**Proposal**: Add `depends_on: [007]` to tickets 003 and 004.

**Impact**: Tickets 003/004 will start ~15min later, but won't waste time
on BLOCKED state.

**Urgency**: High — currently blocking 2 roles.
```
