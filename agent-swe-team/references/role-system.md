# Role System

> Role definitions, cognitive model, autonomy behaviors, and knowledge mounting.

## Role Cognitive Model (Three Layers)

Every role operates with three layers of awareness, not just a ticket:

```
Layer 1 — Goal (Why)
  "Build a production-ready Expo RN app with 18 features"

Layer 2 — Plan (What)
  "Progress: Foundation 100% | Features 40% | QA ongoing"
  "My ticket: 003 — implement WorkOrder + Parcel + Review screens"
  "Dependencies: 007 ✅ merged"

Layer 3 — Environment (Context)
  "Integration branch: app/ exists, 47 files"
  "Discussion: Reviewer challenged api/client.ts retry logic (thread #7)"
  "QA found: 2 type errors in finance module"
```

Hub injects all three layers into role prompts via `buildAssignPrompt`.

## Base Roles

### architect

Scope: design decisions, interfaces, module boundaries, lightweight scaffolding.
Authority: make architecture decisions. NOT large implementation work.

Workflow:
1. Read ticket + project context (AGENTS.md, domain.md)
2. Propose implementation strategy with clear module boundaries
3. Define interface contracts and type stubs
4. Document decisions with "Why" rationale

Structured output: `## Contracts`, `## Decisions`

### backend

Scope: server-side logic, APIs, database interactions, business rules.
Authority: implement within architectural boundaries. NOT change interfaces without architect approval.

Workflow:
1. Read ticket + consume architect contracts
2. Implement server logic + tests
3. Run build/lint/test commands
4. Note API surface changes in report

Structured output: `## Contracts`, `## API Surface`

### frontend

Scope: UI implementation, interactions, component composition.
Authority: implement within design system constraints. NOT introduce new design patterns.

Workflow:
1. Read ticket + project UI conventions
2. Check existing component patterns (styling, naming)
3. Implement UI + interactions + tests
4. Note blast radius of shared style changes

Structured output: `## Contracts`

### qa

Scope: verification, regression risks, edge cases, automated tests.
Authority: add/fix tests. NOT make broad functional changes.

**Continuous mode** — QA does NOT wait for all implementation to finish:
- Monitor integration branch for new commits
- Run type checks and builds incrementally
- Report failures immediately via discussion thread

Workflow:
1. Extract acceptance criteria from ticket
2. Identify highest-risk behaviors and regressions
3. Run tests, capture results
4. Add missing tests or improve coverage

Structured output: `## Findings`, `## Contracts` (verified interfaces)

### reviewer

Scope: code review, bug/risk/regression surfacing, small safe fixes.
Authority: apply small fixes to own branch. NOT make architecture decisions.

**Continuous mode** — Reviewer does NOT wait for Phase 8:
- Monitor integration branch diffs via `git log --oneline integration/<runId>`
- Challenge commits in real-time via discussion thread
- Final full review after all implementation completes

Workflow:
1. Inspect role branch diffs via `git diff`
2. Identify: correctness, edge cases, missing tests, dead code
3. Suggest fixes with exact code snippets
4. Commit fixes to own branch if safe

Structured output: `## Findings` (severity-tagged: 🔴 MUST_FIX, 🟡 SHOULD_FIX, 🟢 OPTIONAL)

## Role Autonomy — Self-Governing Behaviors

### When Blocked: Find Alternative Work

When a role cannot execute its primary ticket (e.g., missing dependency),
it does NOT just report BLOCKED and wait. It actively seeks alternative work:

| Situation | Autonomous Action |
|:---|:---|
| Foundation code missing | Write type definitions, mock data, test fixtures |
| API contract unclear | Draft proposed contract + ask architect via thread |
| Build broken | Investigate, propose fix, notify in thread |
| Dependency running | Prepare everything that doesn't need the dependency |

The role reports what it did instead:

```
BLOCKED (partial): Foundation not yet merged.
Completed alternative work:
- Created types/workOrder.ts (type definitions)
- Created __tests__/workOrder.test.ts (test fixtures)
- Ready to integrate when 007 merges.

TEAM_STATUS=BLOCKED
```

### Plan Revision Proposals

Any role that detects a plan defect should propose a revision:

```markdown
## Plan Revision

**Observation**: Finance module requires a GraphQL query not in the API contract.
**Proposal**: Create supplementary ticket for backend to add `financeOverview` query.
**Impact**: Frontend finance ticket blocks until query exists.
**Urgency**: Medium — can implement UI shell with mock data first.
```

Hub extracts `## Plan Revision` and routes to Leader with ATTENTION signal.

## Knowledge Mounting

Roles can be enhanced with external knowledge packs for deeper specialization:

```javascript
// In init config or ticket metadata
{
  "roles": {
    "frontend-1": {
      "knowledge": [
        // References from other skills
        "agent-front-design/references/aesthetic-intelligence.md",
        "agent-front-design/references/design-system.md",
        // Project-specific knowledge
        "docs/DESIGN_SPEC.md",
        "docs/COMPONENT_PATTERNS.md"
      ]
    }
  }
}
```

Hub reads these files and injects them into the role's system prompt,
transforming a generic frontend agent into an expert that knows:
- The project's design token system
- Component anti-patterns to avoid
- Accessibility standards to enforce

**Principle**: Knowledge mounting turns "I know how to write React" into
"I know how to write React *for this project* following *these specific standards*."

## Multi-Instance Expansion

When a role type has count > 1 (e.g., `frontend:3`):

```
frontend:3 → frontend-1, frontend-2, frontend-3

Each instance:
- Gets its own worktree and branch
- Shares the same role template (roles/frontend.md)
- Can have different knowledge mounts
- Is tracked independently in workflow state
```

Workflow state expands type names to instance names:
```
phase.roles = ["frontend"] → {"frontend-1": "pending", "frontend-2": "pending", ...}
```

`markRoleDone("frontend-2")` matches the instance key directly.
