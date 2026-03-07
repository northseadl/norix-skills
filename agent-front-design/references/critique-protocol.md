# Critique Protocol

Self-evaluation as a harsh design critic. This protocol forces you to break out of
your own aesthetic comfort zone by adopting a hostile reviewer persona.

## When to Run

- **Automatic**: End of every Production mode delivery, before final output
- **On request**: User says "critique", "残酷审视", "review this design"
- **Self-triggered**: When you suspect you stopped at L1

## The Protocol

### Step 1: Role Switch

Explicitly declare the switch. This is not optional — the declaration primes different
evaluation circuits:

> "Switching to **Brutal Design Critic** mode. My goal: find every place this design
> settled for 'functional' when it could be 'remarkable.' Zero tolerance for mediocrity."

### Step 2: Ten-Dimension Scan

Score each 1–10. Mark severity: 🔴 fatal / 🟡 needs polish / 🟢 good.

| Dimension | Core Question |
|-----------|--------------|
| **Color Precision** | Any yellowing? Chroma ≤ 0.01? Border-background hue drift ≤ 3°? |
| **Visual Rhythm** | Equal-grid syndrome? Any screen anchors? Breathing room? |
| **Typography Drama** | ≥2 contrast dimensions? Display fonts actually used for display? |
| **Component Craft** | Core components at which L-level? Anything still at L0? |
| **Data Visualization** | Charts: labels? Tooltips? Gradients? Or bare rectangles? |
| **Interaction Feedback** | Press scale ≥ 0.96? Spring rebound? Hover glow? Or invisible? |
| **Temporal Design** | Timeline/feed: data-embedded or dot-and-line? KPI: animated or static? |
| **Spatial Layers** | Floating elements use backdrop-filter? Or flat stacking? |
| **Motion Craft** | Staggered entries? Value animations? Or everything appears at once? |
| **Gut Test** | Close your eyes, reopen — first reaction: "wow" or "eh, works"? |

### Step 3: Report

```markdown
## 🔥 Critique Report — [Target]

**Score: X/10** — [One-line verdict]

### Fatal (🔴)
| # | Issue | Current | Should Be |
|---|-------|---------|-----------|
| 1 | ...   | L0: ... | L2+: ... |

### Polish (🟡)
| # | Issue | Fix Direction |
|---|-------|---------------|
| 1 | ...   | ...           |

### Strengths (🟢)
[What works well]

### Diagnosis
[One paragraph: where did this design stop short? What's the gap to remarkable?]

### Fix Priority
1. ...
2. ...
3. ...
```

### Step 4: Fix Loop

1. Fix all 🔴 items
2. Fix 🟡 items by priority
3. Re-run the 10-dimension scan
4. Loop until: zero 🔴, ≤ 2 🟡

## Your Common Blind Spots

These are high-frequency failure modes specific to LLM-generated UI. Check these first:

1. **Cream Neutrals** — You pick Chroma 0.015+ warm grays. They read as "old paper," not "clean."
2. **Grid Monotony** — Every card same width, same height, same gap. No visual heartbeat.
3. **Font Loading Waste** — Import `Playfair Display` then use `Inter Bold` for headings.
4. **Ghost Feedback** — `scale(0.99)` + `100ms ease` = user feels nothing happened.
5. **Shadow-as-Depth** — Stacking 3 box-shadows instead of using `backdrop-filter` for real layers.
6. **Nude Charts** — Bars without labels, without tooltips, without reference lines.
7. **Primitive Timelines** — Dot + vertical line = 2018. No data cards, no aggregation, no drama.
8. **Color Semantic Void** — Everything is gray. No color meaning for status, progress, urgency.

## Quality Gate

After Critique fixes, verify these thresholds for Production release:

| Check | Threshold |
|-------|-----------|
| Core components | All at L2+ |
| Aesthetic self-check | All 7 questions pass (see aesthetic-intelligence.md) |
| State coverage | All 6 states designed: loading, empty, error, success, permission, partial |
| Accessibility | WCAG 2.2 AA contrast, keyboard navigable, semantic HTML |
| Performance targets | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 |
| 🔴 items | Zero remaining |

If any check fails → block release, iterate.
