---
name: agent-front-design
metadata:
  version: 0.2.0
description: 'Frontend design blueprints with craftsmanship scoring, self-critique
  loops, and engineering handoff. Aesthetic intelligence against AI homogeneity.
  Use for: UI/UX design specs, design system creation, visual direction exploration,
  component design review, design-to-engineering handoff.'
---

# Frontend Design Excellence

Produce stunning, implementable frontend designs. Break free from AI aesthetic
defaults. Push every component from "functional" to "remarkable."

## Modes

### Explore

Creative direction exploration. Generate 2-3 candidates with rationale and risks.
No "publishable" conclusion. Read `references/aesthetic-intelligence.md` first.

### Production

Converge to one implementable spec. Requires:
1. Choose one direction, reject alternatives with reasons
2. Full spec: color, typography, layout, component tree, state coverage
3. Run Critique (see below) — fix all 🔴 before delivery
4. Output quality score and release recommendation

### Critique

Self-evaluation as a harsh design critic. Breaks you out of aesthetic comfort zones.

**Auto-triggered** at end of Production. **User-triggered** anytime via
"critique", "残酷审视", "review the design."

Execute: read `references/critique-protocol.md`, run the full protocol.

Default flow: Explore → Production (includes Critique) → Deliver.

## Reference Routing

Read on demand, by task phase:

| Phase | File | When |
|-------|------|------|
| Direction | `references/aesthetic-intelligence.md` | Always at start — the core |
| Critique | `references/critique-protocol.md` | Production end, or user request |
| Engineering | `references/design-system.md` | Defining tokens, modern CSS |
| IA/Interaction | `references/page-patterns.md` | Page structure, states, flows |
| Handoff | `references/engineering-handoff.md` | React/Vue delivery |

## Delivery Checklist

Final output must include:

1. One primary direction + rejected alternatives with reasons
2. Color palette with OKLCH values and brand rationale
3. Typography pairing with contrast justification
4. Key page layouts (ASCII/wireframe)
5. Component tree with state boundaries
6. State coverage: `loading / empty / error / success / permission`
7. Critique report (or reason for skip)
8. Quality score and release recommendation
9. Accessibility checkpoints (contrast, keyboard, semantics)
10. Performance budget (LCP/INP/CLS targets)
