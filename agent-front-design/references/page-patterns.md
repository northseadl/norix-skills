# Page Patterns & State Coverage

Page archetype selection, interaction model choice, and state completeness.

## Page Archetype Selection

Pick based on the page's core job:

| Core Job | Archetype | Key Structure |
|----------|-----------|--------------|
| Monitor metrics | **Dashboard** | KPI strip → main chart → drilldown + actions |
| Complex create/edit | **Workspace** | 3-panel: nav tree / work area / inspector |
| Step-by-step flow | **Wizard** | Step indicator → content → prev/next |
| Browse content stream | **Feed** | Filter tabs → card list → infinite scroll |
| Adjust preferences | **Settings** | Side nav → sectioned forms → save |

### Dashboard Specifics
- KPI cards: number + trend + sparkline (not just number + label)
- Charts: support time granularity switching, have tooltips and data labels
- Quick actions panel reduces navigation cost

### Feed/Timeline Specifics
- Virtual scrolling for 100+ items
- Filter/sort without full page refresh
- Scroll position restore on back-navigation
- New content notification (non-intrusive)

## Interaction Model Selection

Choose by **risk × cognitive complexity**:

| | Low Cognitive | High Cognitive |
|---|---|---|
| **Low Risk** | Direct manipulation (toggle, drag, favorite) | Inline edit (click-to-edit, rename) |
| **High Risk** | Command-confirm (delete, publish, bulk ops) | Draft-review-publish (content, config) |

Key rules:
- Every action → visible feedback within 100ms
- Every failure → recovery path (never a dead end)
- Same interaction pattern for same operation type across all pages

## State Coverage

Every data-driven view must design all 6 states:

| State | What User Sees | Recovery |
|-------|---------------|----------|
| **Loading** | Skeleton matching real layout (not spinner) | Auto-resolve |
| **Empty** | Context-specific illustration + action button | Guide to create/adjust |
| **Error** | What broke + impact scope + retry button | Retry / fallback |
| **Success** | Normal content view | — |
| **Permission** | Why blocked + how to get access | Request / contact admin |
| **Partial** | Available data + failed sections marked | Retry failed parts |

Rules:
- Skip loading indicator for operations < 300ms (avoid flash)
- Show timeout message after 30s
- Empty states have actionable guidance, not just "no data"
- State transitions use fade/morph, never hard-cut
