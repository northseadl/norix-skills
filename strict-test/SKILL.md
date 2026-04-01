---
name: strict-test
description: |
  测试认识论与流程规范：认知质量标准、各平台强制工作流、验证门禁。
  编写/运行/验证测试时使用，约束测试思维与流程而非教写代码。
metadata:
  version: 0.1.0
---

# Strict Test — Epistemology & Process Specification

## What This Skill Is

A set of **cognitive quality standards** and **process gates** that govern how tests are conceived, written, executed, and verified. It assumes the agent already knows the testing tools. It does not provide tutorials or example code.

## Axiom

> The sole purpose of a test is to increase confidence that the system works correctly in reality.
>
> A test that passes regardless of whether the system has bugs provides zero confidence increase. Such a test is invalid — it occupies space, consumes attention, and produces a false sense of security.

## Platform Detection

Read the project files to determine the platform. Then read ONLY the corresponding spec:

| Signal in Project | Platform | Spec |
|-------------------|----------|------|
| `project.config.json` or Taro config | WeChat miniapp | `references/wechat-miniapp.md` |
| `.xcodeproj` / `Podfile` / Xcode workspace | iOS | `references/ios-app.md` |
| Browser-based app or Playwright config | Web E2E | `references/web-frontend.md` |
| Server framework (Hono/Express/Fastify/Nest) | Node API | `references/node-api.md` |
| React/Vue/Svelte components without E2E | Web component unit | `references/web-frontend.md` |

---

## Part 1: Epistemology Layer

These five criteria define what it means for a test to "know" something. Every test must satisfy ALL of them. Violating any one makes the test invalid, regardless of whether it passes.

### E1: Validity Criterion

> A test is valid if and only if at least one **realistic bug** would cause it to fail.

"Realistic bug" means the kind of mistake a competent developer makes under normal conditions:

- Wrong database column name or query condition
- Type confusion (string vs number, null vs undefined)
- Off-by-one (`>=` vs `>`, index start, boundary)
- Missing null/empty defense
- Wrong API path, parameter name, or response field
- Incorrect operator in conditional logic

**Verification method**: After writing a test, mentally inject one realistic bug into the code under test. If the test would still pass, the test is invalid — rewrite it or delete it.

A test that only catches "total deletion of the function" but survives all realistic mutations is too weak.

### E2: Independence Criterion

> The expected value of an assertion must have a source **independent of the implementation**.

Legitimate sources:

| Source | Example |
|--------|---------|
| Product requirement | "Empty username displays '未命名用户'" |
| API contract / schema | "price field is a number, not a string" |
| Live baseline | Fetch the real API, compare UI against response |
| Mathematical invariant | "pagination offset = (page - 1) × pageSize" |
| Independent calculation | Verify with a different algorithm or manual derivation |

Illegitimate source:

| Anti-pattern | Why invalid |
|--------------|-------------|
| Read implementation → hand-calculate result → write expect | Tautology: test and code share the same mental model |
| Copy hardcoded string from JSX into expect | Tests React's createElement, not business logic |

When no independent source exists for a value, the test should verify **structural properties** instead (type, range, non-null, array length > 0) rather than exact values copied from source code.

### E3: Mock Accountability

> Every mock creates a detection blind spot. Every blind spot must be declared and covered.

When mocking a dependency, the test file must include a **Gap Declaration**:

```
// MOCK GAP: DB is mocked → SQL query correctness NOT tested here
// COVERED BY: integration tests in __tests__/integration/ using real DB
```

Rules:
1. Each mock → one gap declaration stating what is NOT being tested
2. Each gap → a named test layer or file that covers it
3. Phase 5 audits all gaps — any uncovered gap = test suite incomplete
4. If no other layer exists to cover a gap, the mock is not justified — remove it and test against the real dependency

Mock is not free. Mock is debt. Declare the debt, pay it somewhere.

### E4: Adversarial Review

> After writing tests, the agent must become the attacker.

Before declaring a test suite complete:

1. List the 5 most likely realistic bugs for the module under test
2. For each bug, trace through the test suite — would any test fail?
3. If a bug survives all tests, the suite is incomplete — add a test that catches it
4. Document the 5 bugs and their detection status as part of the test file or review output

This institutionalizes the "red team" role into the workflow. The agent who writes the tests must also try to break them.

### E5: Coverage as Diagnostic

> Coverage is a tool to find untested paths, not a goal to achieve.

- Use coverage reports to discover which code paths lack meaningful test scenarios
- Never write a test solely to increase a coverage number
- A test that exists only to cover an optional-chaining branch or a compile-time dead branch is invalid per E1
- 80% coverage where every test satisfies E1-E4 is superior to 100% coverage with hollow assertions

Coverage thresholds remain as project configuration, but passing the threshold is not sufficient to pass Phase 5. E4 adversarial review is the real gate.

---

## Part 2: Three-Layer Test Architecture

Every project must have three test layers with non-overlapping responsibilities. Each layer exists specifically to cover the blind spots created by the layer above.

| Layer | What it tests | What it mocks | Blind spots (covered by layer below) |
|-------|--------------|---------------|--------------------------------------|
| **Unit** | Pure transformation logic, conditional branches, formatting | I/O dependencies (DB, API, filesystem) | I/O correctness: SQL queries, API calls, data binding |
| **Integration** | I/O correctness: real queries return expected data, real API responses render correctly | Nothing in the tested path; external services may use test instances | Full user flow, cross-page navigation, visual layout |
| **E2E** | User-visible behavior: can a user complete a real workflow end-to-end? | Nothing | Internal logic (too slow to cover all branches) |

If a project currently has only Unit + E2E, the Integration layer is mandatory to add — it is where most real bugs live (the interaction between code and its dependencies).

See the platform-specific reference for how each layer is implemented per platform.

---

## Part 3: Mandatory Lifecycle

Every test task follows these phases in order. Each has a gate that blocks the next phase.

### Phase 1: Environment

**Do:** Detect tools, install missing dependencies.

**Gate:** Test runner executes without import/config errors.

### Phase 2: Preflight

**Do:** Verify runtime prerequisites — services, builds, simulators, databases. Abort immediately with exit code 3 and fix instruction on failure.

**Gate:** All services reachable, all builds present, all tools accessible.

### Phase 3: Write

**Do:** Write tests following ALL of E1-E3:
1. Before each test, state the requirement being verified (comment or test name)
2. Derive expected values from an independent source (E2)
3. Declare mock gaps (E3)
4. Mentally inject a realistic bug to confirm the test would catch it (E1)

**Gate:** Every test body has assertions that satisfy E1 (validity) and E2 (independence). All mocks have gap declarations.

### Phase 4: Execute

**Do:** Run the test suite. Capture full stdout/stderr.

**Gate:** Test runner output is visible. Pass/fail count is readable.

### Phase 5: Verify + Adversarial Review

**Do:**
1. Read execution output — confirm passes are genuine
2. Run E4 adversarial review: list 5 realistic bugs, check detection
3. Run gap audit: collect all mock gap declarations, verify each is covered by another layer
4. Review coverage as diagnostic — investigate uncovered paths for missing scenarios

**Gate:** All tests pass. All 5 adversarial bugs are caught. All mock gaps are covered. No test exists solely for coverage.

### Phase 6: Report

**Do:** Show the user:
- Pass count, fail count
- Adversarial review results (5 bugs × caught/not-caught)
- Mock gap coverage matrix
- Any uncovered paths and why they are acceptable

**Gate:** User has seen real execution output and adversarial analysis.

---

## Part 4: Strictness Rules

Non-negotiable constraints that apply across all platforms.

### Rule 1: Execution Before Completion

Writing tests does not mean the task is done. Tests must be executed and their output read before declaring completion.

### Rule 2: Interaction Verification Requirement

Every interaction test must verify the **outcome**, not just the action. The mechanism depends on the platform:

- **Platforms where tap/click never throws** (WeChat miniapp): Install a spy on the expected target API before the interaction, then assert the spy was called after. See `wechat-miniapp.md`.
- **Platforms where click throws on missing elements** (Playwright, XCUITest): Assert the resulting state change — URL changed, element appeared, content updated. See `web-frontend.md` and `ios-app.md`.

In both cases, a bare `click()` or `tap()` without a subsequent assertion is invalid.

### Rule 3: Live Baseline for Data Tests

When verifying displayed data, fetch the live API response first and use it as baseline. Never hardcode expected strings — they become stale and produce false passes. (This is a specific application of E2.)

### Rule 4: Bounds-Based Layout Checks

To verify layout correctness, check element edge positions against viewport bounds. Dimensions-only checks miss overflow from positioning.

### Rule 5: Environment Independence

Tests must declare and verify their dependencies. No assumed pre-installs. No hardcoded absolute paths. No project-specific selectors in the skill itself.

### Rule 6: Preflight Abort on Failure

If the environment is not ready, abort immediately with exit code 3 and fix instruction. Never hang, retry indefinitely, or proceed broken.
