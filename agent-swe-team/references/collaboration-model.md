# Collaboration Model

> Living Blackboard, discussion threads, continuous adversarial review,
> and goal-driven self-governance.

## Living Blackboard

The Blackboard is not a dead file system — it is the team's **shared consciousness**.

### Structure

```
blackboard/
├── goal.md              ← Team goal + current progress
├── plan.md              ← Ticket DAG + status (mutable by Plan Revisions)
├── contracts/           ← Interface contracts (from ## Contracts sections)
├── decisions.jsonl      ← Architecture decisions log
├── changelog.md         ← What changed, by whom, when
├── codemap.md           ← Auto-generated module dependency graph
├── team-digest.md       ← Current team status summary
└── threads/             ← Discussion threads (real-time role interaction)
    ├── 001-router-strategy.md
    ├── 002-api-retry-logic.md
    └── ...
```

### Goal Tracking

`goal.md` is auto-maintained by Hub:

```markdown
# Team Goal

> Build a production-ready Expo RN application with 18 features
> for the Chuanghuo Operation Center.

## Progress

| Category | Done | Total | % |
|:---|:---|:---|:---|
| Foundation | 1 | 1 | 100% |
| P1 Features | 3 | 8 | 37% |
| P2 Features | 0 | 5 | 0% |
| QA Verified | 2 | 14 | 14% |
| Review Approved | 1 | 14 | 7% |

## Active Work

- frontend-1: ticket 005 (P2 features) — RUNNING 8m
- frontend-2: ticket 003-fix (review fix) — RUNNING 3m
- reviewer: continuous observation — IDLE (watching integration)

## Ticket DAG Status

007(✅) → 003(🔄) → 005(⏳)
         → 004(✅) → 006(⏳)
```

Roles see this in their prompt. They know the big picture.

### Codemap Generation

After each merge to integration branch, Hub auto-generates `codemap.md`:

```markdown
## Module Map

app/
├── (tabs)/           ← Tab navigator (5 screens)
│   ├── index.tsx     ← Home dashboard
│   ├── orders.tsx    ← WorkOrder list → depends: api/workOrder.ts
│   └── finance.tsx   ← Finance overview → depends: api/finance.ts
├── src/
│   ├── api/          ← GraphQL client layer (4 modules)
│   ├── components/   ← Shared components (12 files)
│   ├── theme/        ← Design tokens (colors, typography, spacing)
│   └── stores/       ← Zustand stores (3 modules)
```

This gives roles instant awareness of what exists and where things live.

## Discussion Threads

Roles communicate via discussion threads — inspired by brainstorm's Discussion Space,
but focused on code decisions rather than strategy debates.

### Thread Lifecycle

```
1. Any role CREATEs a thread with a topic
2. Other roles READ threads in their prompt context
3. Roles RESPOND / CHALLENGE / BUILD on threads
4. Thread RESOLVEs when consensus is reached or Leader decides
```

### Thread Operations

Roles interact with threads through structured sections in their reports:

```markdown
## Discussion

### New Thread: Router Strategy

**Topic**: Should we use tab-based or stack-based navigation?
**My Position**: Tab-based is standard for mobile apps with 5+ sections.
**Evidence**: iOS HIG and Material Design both recommend bottom tabs for 3-5 top-level destinations.
**Question**: Does the existing H5 app use tab navigation?

### Response to Thread #2 (API Retry Logic)

**@reviewer**: Good catch on the 401 handling. I've updated `api/client.ts` to
use an interceptor chain: retry 3x on 5xx, refresh token on 401, abort on 403.
See commit abc1234.
```

Hub extracts discussion entries and routes them:
- New threads: added to `blackboard/threads/`
- Responses: appended to existing thread
- All roles see recent threads in their next prompt injection

### When to Use Threads vs BLOCKED

| Situation | Use |
|:---|:---|
| Need information from another role | Thread (non-blocking) |
| Disagree with another role's approach | Thread + Challenge |
| Literally cannot proceed without external input | BLOCKED (decision type) |
| Found a bug in another role's code | Thread (with severity tag) |
| Want to propose a plan change | Plan Revision (→ Leader) |

## Continuous Adversarial Model

### QA Continuous Loop

```python
# Pseudocode for QA's continuous work cycle
while team_running:
    new_commits = check_integration_branch()
    for commit in new_commits:
        run_type_check()           # pnpm tsc --noEmit
        run_linter()               # pnpm lint
        attempt_build()            # pnpm expo export --platform web
        if failures:
            post_to_thread(
                severity="🔴" if build_broken else "🟡",
                message=f"Commit {commit.sha}: {failure_description}",
                affected_role=commit.author_role
            )
    sleep(integration_poll_interval)
```

QA doesn't wait for "verify phase." It runs continuously once there's code to verify.

### Reviewer Continuous Loop

```python
while team_running:
    new_commits = check_integration_branch()
    for commit in new_commits:
        diff = get_commit_diff(commit)
        review_result = analyze_diff(diff)
        if review_result.has_issues:
            post_to_thread(
                severity=review_result.severity,
                message=review_result.finding,
                affected_role=commit.author_role,
                suggested_fix=review_result.fix
            )
    # Also: periodic full-branch review
    if all_implementation_done:
        run_full_review()  # Comprehensive final pass
    sleep(review_poll_interval)
```

Reviewer provides real-time feedback. Most issues are caught and fixed during
implementation, not after. Final review becomes a lightweight confirmation.

### Adversarial Quality Metrics

Hub tracks review health automatically:

```
Review Velocity:
  Issues raised: 12
  Issues resolved: 10
  Avg time to fix: 4m
  Outstanding 🔴: 0
  Outstanding 🟡: 2
```

## Plan Revision Workflow

When a role detects a plan defect, the full flow is:

```
1. Role includes ## Plan Revision in report
2. Hub extracts revision, writes to blackboard/plan-revisions/
3. Hub writes signal: TEAM_DISCUSSION thread=plan-revision-N
4. Leader reviews:
   - APPROVE → Hub updates plan.md + adjusts ticket deps
   - REJECT → Hub notifies role with reason
   - MODIFY → Leader adjusts proposal, Hub applies modified version
5. Affected roles see updated plan in next prompt injection
```

This closes the gap between "plan was wrong" and "plan gets fixed" — without
requiring Leader to proactively monitor every detail.

## Convergence Detection

Hub monitors for "team is done" using these conditions:

```
ALL of:
  - Every ticket: DONE or SKIPPED
  - Integration branch: builds successfully
  - Outstanding 🔴 findings: 0
  - No pending Plan Revisions
  
THEN:
  - Signal: COMPLETED
  - Leader proceeds to Phase 4 (Accept + Deliver)
```
