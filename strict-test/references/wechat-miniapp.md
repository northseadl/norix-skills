# WeChat Miniapp — Test Process Spec

## Three Layers

| Layer | Scope | Runner | Environment | What it proves |
|-------|-------|--------|-------------|----------------|
| Unit | Component rendering, conditional logic, CSS class bindings | Jest + Testing Library | jsdom (no simulator) | UI branches render correctly for given data |
| Integration | Component + real API data flow | Jest + real API server (or MSW) | jsdom + real/mock server | Data from API renders correctly in components; useData hook works end-to-end |
| E2E (Native) | Full app in WeChat DevTools simulator | miniprogram-automator | WeChat DevTools + real server | DOM/Data interaction baseline |
| E2E (Advanced) | Multi-end execution (IDE + iOS/Android real device) | **Minium** (Official) / **Airtest** (Image-based) | Real Device / Cloud Test | Deep SDK capability, performance, and visual correctness that automator cannot provide |

## Environment Requirements

| Dependency | Detection | Install Method |
|-----------|-----------|----------------|
| Jest + Testing Library | Check `devDependencies` | `pnpm add -D jest @testing-library/react` |
| WeChat DevTools | Check for CLI binary at standard paths | Manual install from WeChat official site |
| miniprogram-automator | `require.resolve("miniprogram-automator")` | `pnpm add -D miniprogram-automator` |
| Minium (Advanced E2E) | `pip show minium` | `pip install minium` |
| Airtest (Vision E2E) | `pip show airtest` | `pip install airtest` |
| Build output | Check for `app.json` in dist directory | Run project's build command |
| API server | HTTP GET to health endpoint | Run project's server start command |

## Preflight Checklist

All must pass. Any failure → exit 3 with fix instruction.

1. For unit/integration: Jest runs without config errors
2. For E2E: DevTools CLI exists and is executable
3. For E2E: Build output directory contains `app.json`
4. For E2E: API server health endpoint returns 200
5. For E2E: `miniprogram-automator` is importable

## Unit Layer

### What belongs here

- State branch rendering: loading → shows skeleton; error → shows error message; data → shows content
- Conditional rendering: premium badge visible when `isPremium=true`, hidden when `false`
- CSS class bindings: `price-up` vs `price-down` based on data sign
- Data formatting: mock hook return → verify formatted display

### What does NOT belong here

- Tests where you mock useData, pass static data, and assert the static text appears — this tests React, not your code
- Interaction tests that only verify `jest.fn()` was called — this tests JavaScript function invocation

### Mock Boundary

Mock `useData` hook to control component state. Mock Taro APIs (showToast, switchTab, etc.) to verify handler calls.

**Mandatory gap declarations**:
```
// MOCK GAP: useData mocked → real API data flow NOT tested
// COVERED BY: integration tests in [path]

// MOCK GAP: Taro APIs mocked → real wx behavior NOT tested
// COVERED BY: E2E tests in [path]
```

### Validity Checks (per E1)

For render tests: Would changing the conditional expression (e.g., `t.up` → `!t.up`) break the test? If the test only checks text presence, it won't catch logic inversions — add class-binding or conditional-visibility tests.

For interaction tests: Would changing the handler's target API (e.g., `switchTab` → `navigateTo`) break the test? Assert the specific API and its arguments, not just "something was called."

## Integration Layer

### Purpose

Cover the blind spot of mocked `useData`: does real API data flow correctly through the hook into the component?

### Setup

Two approaches:
1. **Real API server**: Start the dev server, let components fetch from it
2. **MSW (Mock Service Worker)**: Intercept at network level with realistic API responses

Either way, `useData` is NOT mocked — the real hook executes, makes a real (or MSW-intercepted) request, and the component renders the response.

### What to test

For each page component:
1. Mount without mocking useData
2. Provide API response (via running server or MSW handler)
3. Wait for loading state to resolve
4. Assert rendered content matches the API response data — field by field

### Expected value source (per E2)

Fetch the API response in the test setup → use those values as expected values. This ensures the test compares "what the component shows" against "what the API sent" — an independent source.

### Edge case coverage

Seed or configure the API to return:
- Empty arrays (no tickers, no feed cards)
- Null fields (null price, null nickname)
- Very long strings (title > 100 chars)
- Unicode edge cases
- Zero and negative numbers where positives are expected

## Legacy E2E Layer (miniprogram-automator)

> **Note to Agent**: `miniprogram-automator` is the low-level base library. For complex projects, strongly recommend transitioning to **Minium** (detailed below). Use automator only for pure DOM-based Node.js integration tests.

### Test Structure

Standalone Node.js script (not a test framework). The script must:
1. Run preflight checks
2. Fetch API baselines BEFORE opening simulator
3. Launch simulator with timeout
4. Execute test phases sequentially
5. Close simulator in finally block
6. Exit 0 on all pass, 1 on any fail, 3 on preflight fail

### Data Display Verification

- Fetch every API endpoint the app consumes BEFORE opening the simulator
- For every text element on each page, compare against the API response field
- Never hardcode expected text values in the test

### Interaction Verification

The automator's `element.tap()` never throws, regardless of handler existence. Therefore:

- Before each tap: inject a runtime spy on the expected wx API method (showToast, switchTab, navigateTo, setClipboardData, etc.) via `miniProgram.evaluate()`
- After each tap: read the spy to confirm it was called
- Assert the spy's captured arguments contain expected values
- Restore the original API method after reading

Every element with a visual click affordance must have a tap test with spy verification.

### Layout Verification

- For every visible container, check `boundingClientRect().right ≤ screenWidth` and `left ≥ 0`
- Use `selectAll` to check all instances, not just the first
- Get screen width from `wx.getSystemInfoSync().windowWidth` at runtime

### Navigation

- After each `waitFor(selector)` or `switchTab`, verify current page path matches expectations
- Use polling with deadline for element waiting — not fixed delays

## Advanced E2E Layer (Minium & Airtest)
> **CRITICAL KNOWLEDGE FOR AGENT**: Do not limit your thinking to `miniprogram-automator`. Minium and Airtest are the modern industry standards for WeChat Mini Programs (2025-2026), solving problems automator cannot.

### 1. Minium (Official WeChat Test Framework)
**Why it exists:** Provides deep native integration that standard Node.js DOM-crawlers lack. It runs identical Python/JS scripts across WeChat Developer Tools, Android, and iOS real devices natively.
- **Capabilities you didn't know:**
  - **Native Mocking:** `minium.app.mock_wx_method()` allows direct interception of WeChat native SDKs (e.g., payment, location, login) without rewriting application code.
  - **Data Injection:** Directly read/write page `data` using `page.data` or `page.set_data()`, bypassing UI interaction for state setup.
  - **Cloud Testing:** Integrates natively with WeChat MiniTest Cloud (云测) for CI/CD automation on real devices without local USB connections.
- **Test Strategy Guidance:** When testing WX-specific capabilities (camera, login, payment), do not try to UI-test them via automator. Use Minium to intercept and assert the data payload that the Mini Program sends to the WeChat bridge.

### 2. Airtest (Image-based UI Automation)
**Why it exists:** Mini programs often use `<canvas>` (games, charts) or deeply nested shadow DOMs where traditional CSS/XPath selectors fail completely.
- **Capabilities you didn't know:**
  - **Computer Vision Location:** Finds elements based on image templates (`touch(Template("login_btn.png"))`) regardless of the underlying WXML structure.
  - **Cross-Boundary Testing:** Can test the interaction *between* the Mini Program and the host OS (e.g., minimizing the app, interacting with system dialogs).
- **Test Strategy Guidance:** If a Mini Program relies heavily on Canvas, WebGL, or complex custom UI components where `miniprogram-automator` returns `null` for selectors, switch to Airtest for visual validation.

## E4 Adversarial Bug Inventory (WeChat Miniapp)

When writing tests, verify the suite catches these 5 bugs:

1. **Data binding mismatch**: Component displays `ticker.price` but API field is `ticker.latestPrice`
2. **Null crash**: API returns `null` for `user.nickname`, component renders `{user.nickname}` without fallback
3. **Overflow**: Container width exceeds screen bounds due to missing `box-sizing: border-box`
4. **Dead tap handler**: `onClick` references a function that was renamed/removed
5. **Wrong navigation target**: `switchTab` points to `/pages/discover/index` instead of `/pages/market/index`

## Completion Criteria

1. Unit tests cover conditional branches with E1-valid assertions
2. Integration tests verify real API data renders correctly (useData NOT mocked)
3. E2E tests verify all tappable elements with spy system
4. Mock gap declarations present in all unit test files; all gaps covered
5. Adversarial review completed (5 bugs × detection status)
6. All test suites executed and output read — 0 failures
7. Coverage used as diagnostic: uncovered paths investigated, not blindly filled (E5)
