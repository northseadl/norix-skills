# Web Frontend — Test Process Spec

## Three Layers

| Layer | Scope | Runner | Environment | What it proves |
|-------|-------|--------|-------------|----------------|
| Unit | Single component render + conditional logic | Jest / Vitest + Testing Library | jsdom | UI branches and formatting logic are correct |
| Integration | Component + real data flow | Jest / Vitest + MSW (or real dev server) | jsdom + intercepted network | Data from API renders correctly; hooks work end-to-end |
| E2E | Full app in real browser | Playwright / Cypress | Real browser + real server | User workflows complete successfully |

## Environment Requirements

### Unit / Integration
| Dependency | Detection | Install |
|-----------|-----------|---------|
| Test runner | Check `devDependencies` | `pnpm add -D jest` or `vitest` |
| Testing Library | Check imports | `pnpm add -D @testing-library/react` (or vue/svelte variant) |
| jsdom | Check test config `testEnvironment` | Bundled with jest-environment-jsdom |
| MSW (for integration) | Check `devDependencies` | `pnpm add -D msw` |

### E2E
| Dependency | Detection | Install |
|-----------|-----------|---------|
| Playwright | Check for playwright config | `pnpm add -D @playwright/test && npx playwright install` |
| Dev server | Check if app serves on expected port | Run project's dev command |

## Unit Layer

### What belongs here

- Conditional rendering: element present when flag=true, absent when flag=false
- CSS class bindings: correct class applied based on data value (e.g., positive → `price-up`)
- Data formatting: given specific hook return, verify formatted text (dates, numbers, truncation)
- Error/loading/empty states: each state branch renders correct UI

### What does NOT belong here

- Tests that mock the data hook, pass static data, then assert static text appears — this only proves React renders JSX
- Interaction tests that assert `mockFn.toHaveBeenCalled()` without verifying the observable outcome

### Mock Boundary

Mock data hooks at module level to control component state. Mock navigation/toast APIs for interaction verification.

**Mandatory gap declarations**:
```
// MOCK GAP: data hook mocked → API data flow NOT tested
// COVERED BY: integration tests using MSW in [path]

// MOCK GAP: router mocked → real navigation NOT tested
// COVERED BY: E2E tests in [path]
```

### Validity Checks (per E1)

For each test, ask: "If I inverted the conditional (`flag` → `!flag`), would this test fail?"

If the test only checks "text X is present" but doesn't check "text Y is absent in the opposite condition," it cannot catch inverted logic.

## Integration Layer

### Purpose

Cover the blind spot of mocked data hooks: does real API data flow correctly through the hook into the component?

### Setup with MSW

```
// Conceptual — not code to copy
1. Define MSW handlers that return realistic API responses
2. Mount component WITHOUT mocking the data hook
3. The real hook fires, MSW intercepts, returns controlled data
4. Assert rendered content matches the MSW response
```

### What to test

For each data-driven component:
1. Configure MSW with known response data
2. Render the component (real hook, real fetch, intercepted network)
3. Wait for loading to resolve
4. Assert each rendered value matches the corresponding field in the MSW response

### Expected value source (per E2)

The MSW response is defined in the test → component renders it → test compares against the defined response. The expected value comes from the test-controlled API contract, not from reading the component source.

### Edge case coverage

Configure MSW to return:
- Empty arrays (no items to display)
- Null/undefined fields
- Very long strings that might overflow
- Error responses (500, timeout)
- Malformed JSON (if relevant)

## E2E Layer (Playwright)

### Data Tests

- Fetch API responses before testing the UI
- Compare every rendered value against the API baseline
- Use `page.evaluate()` for complex DOM queries when locators aren't sufficient

### Interaction Tests

For every clickable element:
- Click and verify the resulting navigation (URL change), modal (element visible), or state change
- For forms: fill → submit → verify request payload via `page.route()` network spy
- For navigation: click → verify URL changed to expected path

### Layout Tests

- Use `page.evaluate()` with `getBoundingClientRect()` to check element positions
- Verify no element's right edge exceeds viewport width
- Verify no element's left edge is negative

## Adversarial Bug Inventory (E4 Template for Web Frontend)

1. **Data binding typo**: Component reads `data.userName` but API sends `data.username`
2. **Missing loading guard**: Component accesses `data.items.map()` before data is loaded → crash
3. **CSS overflow**: Flex child without `min-width: 0` causes horizontal overflow
4. **Stale closure**: Event handler captures old state due to missing dependency in useEffect
5. **Wrong route**: Navigation button links to `/dashboard` instead of `/profile`

## Completion Criteria

1. Unit tests cover all conditional branches with E1-valid assertions
2. Integration tests verify API → hook → render pipeline with real data flow (hook NOT mocked)
3. E2E tests verify user-visible workflows in real browser
4. Mock gap declarations present; all gaps covered by lower layers
5. Adversarial review completed (5 bugs × detection status)
6. All suites executed and output read — 0 failures
7. Coverage used as diagnostic: uncovered paths investigated, not blindly filled (E5)
