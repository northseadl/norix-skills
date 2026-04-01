# iOS App — Test Process Spec

## Three Layers

| Layer | Scope | Runner | Environment | What it proves |
|-------|-------|--------|-------------|----------------|
| Unit | ViewModel, service, pure logic | XCTest | Xcode test host (no simulator for pure logic) | State transitions, data transformations, business rules are correct |
| Integration | ViewModel + real service layer (or real API) | XCTest | Xcode test host + real/stubbed backend | Data flows correctly from API through service layer to ViewModel state |
| E2E | Full app flow | XCUITest / Detox | iOS Simulator | User can complete workflows, see correct data, navigate between screens |

## Environment Requirements

| Dependency | Detection | Install |
|-----------|-----------|---------|
| Xcode | `xcode-select -p` | Mac App Store or `xcode-select --install` |
| iOS Simulator | `xcrun simctl list devices available` | Bundled with Xcode |
| CocoaPods (if used) | `command -v pod` | `gem install cocoapods && pod install` |
| Detox (if RN) | Check `devDependencies` | `pnpm add -D detox && npx detox build` |

## Preflight Checklist

1. Xcode command line tools installed (`xcode-select -p` succeeds)
2. At least one iOS Simulator is available and booted (or can be booted)
3. App builds successfully (`xcodebuild build-for-testing` or `detox build`)
4. For integration tests: backend server is reachable from test host

## Unit Layer

### What belongs here

- ViewModel state transitions: initial → loaded → error (test each transition independently)
- Service layer with dependency injection (protocol-based mocking for network layer only)
- Data formatting: date formatters, currency formatters, string truncation
- Business rules: eligibility checks, sorting logic, filter predicates

### What does NOT belong here

- Tests that inject mock data into ViewModel and assert the ViewModel holds that data — this tests Swift's property assignment
- Tests where expected value is copied from the implementation source

### Mock Boundary

Mock the network/repository layer via protocol injection. ViewModel and all logic below it execute for real.

**Mandatory gap declaration**:
```
// MOCK GAP: NetworkService mocked → real API integration NOT tested
// COVERED BY: integration tests using staging API
```

### Validity Checks (per E1)

For each test: "If I changed the sort order in the ViewModel (ascending → descending), would this test fail?" If the test only checks count or element existence, it won't — add order-sensitive assertions.

## Integration Layer

### Purpose

Cover the blind spot of mocked network layer: does real API data flow correctly into the ViewModel?

### Setup

- Use a staging API or local test server
- Or use URLProtocol stubbing with realistic response payloads
- ViewModel uses real service → real network call → real (or stubbed) response

### What to test

For each screen's ViewModel:
1. Configure real/stubbed API with known data
2. Trigger the ViewModel's load method
3. Wait for state to reach `.loaded`
4. Assert each published property matches the API response data

### Edge case coverage

Configure API to return:
- Empty results (no items)
- Null optional fields
- 401/403 responses (auth failure)
- Network timeout
- Malformed JSON

## E2E Layer (XCUITest / Detox)

### Interaction Tests

For each tappable element:
1. Query the element by accessibility identifier or label
2. Assert it exists before tapping
3. Tap it
4. Assert the expected outcome: navigation occurred, alert appeared, or content changed

### Data Tests

- Populate via the app's normal data flow (real API or seeded test data)
- Verify displayed values match expectations by querying element text
- Use `app.tables.cells` / `app.staticTexts` / `app.buttons` to locate elements

### Layout Tests

- Use `element.frame` to check position and size
- Verify elements are within screen bounds
- Verify no overlapping elements (compare frames of adjacent elements)

### Detox (React Native)

- Use `element(by.id("identifier")).tap()` + `expect(element(by.id("next-screen"))).toBeVisible()`
- Every tap must have a visibility or navigation assertion afterward
- Never use `waitFor` without a timeout

## Adversarial Bug Inventory (E4 Template for iOS)

1. **ViewModel state stuck**: Async call completes but state never transitions from `.loading` to `.loaded`
2. **Null field crash**: API returns null for optional field, force-unwrap in ViewModel causes crash
3. **Wrong sort order**: List displays oldest-first instead of newest-first
4. **Accessibility missing**: Button exists but has no accessibility identifier → XCUITest can't find it
5. **Navigation target wrong**: Tap on "Settings" opens "Profile" instead

## Completion Criteria

1. Unit tests cover ViewModel state transitions and business logic with E1-valid assertions
2. Integration tests verify real API data flows correctly to ViewModel (network NOT mocked)
3. E2E tests verify all tappable elements and key user flows
4. Mock gap declarations present; all gaps covered
5. Adversarial review completed (5 bugs × detection status)
6. All suites executed on simulator — 0 failures
7. Coverage used as diagnostic: uncovered paths investigated, not blindly filled (E5)
