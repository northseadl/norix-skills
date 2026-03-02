# 001 · Backend Example (dry-run)

## Context
- Goal: Add a minimal `/healthz` endpoint.
- Constraints: Keep change small; match existing routing style.
- References (files/links):

## Scope (precise)
- In-scope: Add route + small test.
- Out-of-scope: Observability, auth, metrics.

## Deliverables
- Files to add/modify: backend router/controller + one test
- Commands to run: project's existing test command

## Acceptance
- [ ] `/healthz` returns 200 with body `ok`
- [ ] tests pass

## Notes to Role
- Keep the patch minimal and easy to review.

