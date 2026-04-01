# Node.js API — Test Process Spec

## Three Layers

| Layer | Scope | Runner | Environment | What it proves |
|-------|-------|--------|-------------|----------------|
| Unit | Pure logic: formatters, validators, transformers | Vitest / Jest | Node.js, no DB | Conditional branches and data transformations are correct |
| Integration | Route handler + real DB | Vitest / Jest + test DB | Node.js + PostgreSQL (testcontainers or docker-compose) | SQL queries return correct data; response shape matches contract |
| E2E (smoke) | Full deployed stack | curl / httpie / supertest against running server | Real server + real DB | Health, auth, error handling work in production-like config |

## Environment Requirements

| Dependency | Detection | Install Method |
|-----------|-----------|----------------|
| Test runner (Vitest or Jest) | Check `devDependencies` | `pnpm add -D vitest` for ESM, `jest` for CJS |
| Coverage provider | Check if coverage config exists | `pnpm add -D @vitest/coverage-v8` or built-in Jest |
| Framework test client | Varies by framework | Hono: built-in `app.request()`. Express: `supertest` |
| Docker (for integration) | `docker --version` | Required for testcontainers; alternative: local PG instance |

## Preflight Checklist

1. Test runner is installed and importable
2. Test config file exists (vitest.config.ts or jest.config.ts)
3. For integration tests: database is accessible (test container starts or local PG responds)
4. `pnpm test` runs without config errors (may have 0 tests initially)

## Unit Layer

### What belongs here

- Pure functions: formatters (`fmtChange`), validators (Zod schemas), mappers (`mapQuotes`)
- Conditional logic: null fallbacks, boundary handling, enum switches
- Response shape construction (given already-fetched data, does the handler format it correctly?)

### What does NOT belong here

- Anything that verifies SQL query correctness — the mock DB makes this invisible
- Tests where expected value is derived by reading the route handler and hand-calculating the result

### Mock Boundary

Mock the database layer. Use the framework's in-process test client.

**Mandatory gap declaration**: Every test file that mocks DB must include:
```
// MOCK GAP: DB mocked → SQL correctness (WHERE, JOIN, ORDER, LIMIT) NOT verified
// COVERED BY: integration tests in [path to integration test file]
```

### Validity Checks (per E1)

For each unit test, ask: "If I changed the WHERE clause to a no-op, would this test fail?" If the answer is no, this is an integration concern — move it to the integration layer or acknowledge the gap.

## Integration Layer

### Purpose

This layer exists specifically to cover the blind spot created by mocking DB in unit tests. It answers: **"Do the SQL queries actually return the right data?"**

### Setup

- Use testcontainers, docker-compose, or a dedicated test PostgreSQL instance
- Run migrations and seed with known test data before the suite
- Each test gets a clean transaction (rollback after test) or a fresh schema

### What to test

For each route handler:
1. **Happy path with real DB**: seed specific rows → call the route → verify the response contains exactly those rows (not more, not fewer)
2. **Filter correctness**: seed rows with varying attributes → call with filter params → verify only matching rows returned
3. **Pagination**: seed N rows → request page 2 with pageSize M → verify correct slice
4. **Edge cases**: empty table, null fields in DB, unicode, very long strings

### Expected value source (per E2)

The expected value comes from the seed data — you know exactly what you inserted, so you know exactly what should come back. This is independent of the implementation.

### Mock policy

**No mocks in the tested path.** The route handler, ORM, and database are all real. External services (third-party APIs) may use test doubles.

## E2E / Smoke Layer

### Purpose

Verify the assembled application works in a production-like configuration.

### What to test

- Health check endpoint returns 200
- 404 handler returns correct JSON shape
- Error handler returns 500 JSON (trigger via known error path)
- CORS headers present on preflight requests
- Auth middleware rejects invalid tokens (if applicable)

### When to run

After deployment to staging, or as part of CI after docker-compose up.

## Adversarial Bug Inventory (E4 Template for Node API)

When writing tests for a route handler, consider these 5 bug categories:

1. **Wrong WHERE column**: `eq(table.sourceType, value)` → `eq(table.title, value)`
2. **Missing null guard**: `result[0]?.count` → `result[0].count` (crashes on empty)
3. **Off-by-one pagination**: `(page - 1) * pageSize` → `page * pageSize`
4. **Type coercion error**: forgetting `Number()` on decimal string from DB
5. **Wrong sort order**: `desc(createdAt)` → `asc(createdAt)` (latest becomes oldest)

For each, verify at least one test would catch it.

## Completion Criteria

1. Every route file has unit tests for transformation logic + integration tests for query correctness
2. Mock gap declarations present and all gaps covered by integration layer
3. Adversarial review completed (5 bugs × caught status)
4. All test suites executed and output read — 0 failures
5. No route handler has SQL queries tested only through mocked DB
6. Coverage used as diagnostic: uncovered paths investigated, not blindly filled (E5)
