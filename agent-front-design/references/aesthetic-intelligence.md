# Aesthetic Intelligence

The core judgment framework. This is NOT a CSS tutorial — you already know CSS.
This is about the **judgment calls** that separate generic AI output from remarkable design.

## Your Biases (Know Them)

LLMs have statistical aesthetic biases from training data. You will default to these
unless you actively resist:

1. **Indigo Bias** — You gravitate toward `#4F46E5`-family purple-blues as "modern"
2. **Font Apathy** — You default to Inter/Roboto and forget to create typographic drama
3. **Equal Grid Syndrome** — You make all cards same size, same gap, no visual anchor
4. **Timid Interactions** — You use `scale(0.99)` thinking it's feedback (it's invisible)
5. **Decoration Guilt** — You avoid glassmorphism, gradients, animations out of "restraint"
6. **Neutral-But-Yellow** — You pick warm grays with Chroma > 0.01 that read as "cream"
7. **60% Handoff** — You stop refining when it's "correct" instead of pushing to "remarkable"

Knowing these biases is half the battle. The other half is the framework below.

## Seven Design Principles

### 1. Intentionality
Every visual decision traces to a business goal or user need. No decoration for decoration's
sake — but intentional beauty IS a legitimate goal ("delight the user" is a valid reason).

### 2. Restraint ≠ Austerity
Reduce element count, increase element quality. A page with 5 perfect components beats
a page with 15 adequate ones. Restraint means "fewer but better," not "fewer and plainer."

### 3. Authenticity
Design should sound like the brand, not like "average AI output." Choose colors from brand
DNA, fonts from content personality, illustrations from business context.

### 4. Hierarchy
Clear visual hierarchy lets users "see" before they "read." Tools in priority order:
size contrast → color weight → spatial grouping → typographic rhythm.

### 5. Coherence
System-level consistency > single-page wow. Same semantics = same components across pages.

### 6. Resilience
Design for reality: overflow text, empty data, slow networks, 320px–2560px screens.

### 7. Craftsmanship
**This is the principle that separates 60-point "works" from 100-point "wow."**

Push every component from minimum viable to remarkable. Use the ladder:

| Level | Definition | Example |
|-------|-----------|---------|
| L0 | Functionally correct, no visual care | Gray rectangle + plain text |
| L1 | Basic visual structure | Rounded corners, shadow, spacing |
| L2 | Polished details and feedback | Subtle gradient overlay, progress visualization, spring animations |
| **L3** | **Surprising visual narrative** | **SVG ring indicators, embedded data sparklines, glow feedback, content-aware color** |

**Production target: core components ≥ L2, key interaction points → L3.**

## Color Precision

### Neutral Colors
Neutral white ≠ cream ≠ ivory. These are perceptually distinct.

- **Ideal** clean neutral: OKLCH Chroma ≤ 0.005, Hue drift ≤ 5° across the scale
- **Hard reject**: Chroma > 0.01 → perceptibly yellow. Not neutral.
- Border-to-background hue drift ≤ 3°

Quick reference:
- Clean neutral: `#FDFDFC` `#F8F8F7` (C ≈ 0.003)
- Warm cream (intentional): `#F7F6F3` (C ≈ 0.015) — only if brand calls for warmth
- Cool gray: `#F5F5F7` (C ≈ 0.005) — tech/Apple aesthetic

### Brand Colors
Build palettes in OKLCH from brand DNA, not from "looks techy." Generate a lightness
ladder at consistent hue. Verify all text combinations pass WCAG 2.2 AA (4.5:1 body, 3:1 large).

### What to Avoid
- Indigo/violet as primary without brand justification
- Purple-to-blue gradients as default "modern" aesthetic
- Neon/glow effects without functional purpose

## Typography Contrast

Typography hierarchy is information architecture made visible. Weak hierarchy = wasted
screen. Loading a display font and not using it = wasting a resource.

Achieve drama through at least 2 of these contrast dimensions:

| Dimension | What it means | Example |
|-----------|--------------|---------|
| Family | Title vs body use different typefaces | DM Serif Display (title) + Inter (body) |
| Weight | ≥300 weight span | Bold 700 (title) + Regular 400 (body) |
| Size | Title ≥ 2× body size | 32px title vs 15px body |
| Style | Serif vs sans, or regular vs italic | Serif headings, sans-serif body |

Choose fonts by content personality, not by popularity:

| Personality | Direction | Examples |
|-------------|----------|---------|
| Professional | Geometric sans or monospace | Space Grotesk, Geist, JetBrains Mono |
| Editorial | Serif + sans pairing | Playfair + Source Sans, Merriweather + Lato |
| Creative | Expressive display | Outfit, Syne, Cabinet Grotesk |
| Warm | Rounded humanist | Nunito, Plus Jakarta Sans, Quicksand |
| Minimal | Neutral but distinctive | Satoshi, General Sans, Switzer |

## Visual Rhythm

Dead-even grids are visual white noise. The eye needs **anchors, breathing, tempo**.

Techniques:
1. **Weight hierarchy** — Not all cards are equal. Size/saturation creates primary vs secondary
2. **Spacing rhythm** — Module gaps > element gaps. Big space separates themes, small separates details
3. **Anchor elements** — Each screen has ≥1 visual anchor (hero number, accent block, featured card)
4. **Intentional grid breaks** — In a regular grid, one span-2 or height-stagger creates interest
5. **Reading tempo** — Dividers, color sections, icon groups create scannable beats

## Glassmorphism & Layer Effects

`backdrop-filter` is a legitimate, powerful layer-separation tool. Use it where spatial
hierarchy needs visual expression:

**Natural fits**: floating navbars, sticky headers, bottom sheets, overlay masks, notification
toasts, any element that sits "above" scrolling content.

**Poor fits**: card bodies (need solid foundation), full-page backgrounds, purely decorative.

Implementation: always pair `backdrop-filter: blur()` with semi-transparent `background`
and a subtle border. Dark mode needs independent tuning.

## Motion & Interaction Quality

You know CSS animations. These are the **judgment calls**:

### Perception Thresholds
- `scale(0.99)` is **invisible**. Minimum perceivable press: **`scale(0.96)`**
- Hover lift: `translateY(-2px)` minimum for screen depth perception
- Transitions < 80ms feel instant, > 400ms feel sluggish (page transitions excepted)
- Spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for elastic feel

### Four Legitimate Reasons for Motion
1. **Spatial continuity** — Where things come from and go to
2. **State feedback** — Confirming what just happened
3. **Attention guidance** — Directing eyes to important changes
4. **Delight** — Micro-animations that make the product feel alive and crafted

Reason 4 is **explicitly permitted**. The "restraint" principle means don't add 10 pointless
animations, not "make everything static." A spring-bounce button, a number roll-up on KPIs,
a glow pulse on a status indicator — these are signs of craftsmanship.

### Craftsmanship Interaction Patterns

| Element | L0 (basic) | L2 (polished) | L3 (remarkable) |
|---------|-----------|--------------|----------------|
| Button press | Color change | scale(0.96) + color + shadow shift | Elastic rebound + ripple/glow |
| Card hover | Nothing | translateY(-2px) + shadow deepen | Light glow rim + content preview shift |
| Avatar | Letter circle | Gradient bg + status dot | Breathing ring + online pulse |
| Progress | Bare number | Linear bar + percentage | SVG arc + animated value |
| Data card | Number + label | Number + trend arrow | Embedded sparkline + delta coloring |
| Timeline | Dot + line | Typed icons + varied node sizes | Data-embedded cards + date anchors |
| Chart | Bare bars | Data labels + reference lines | Hover tooltips + gradient fills + focus states |
| List row | Plain text | Avatar + meta + action | Inline progress bar + mini trend chart |

### Always Support
- `prefers-reduced-motion: reduce` — degrade all motion gracefully
- Non-motion alternatives for every state feedback (color/text, not just animation)

## Aesthetic Self-Check

Before delivering any design, answer honestly:

1. Is my primary palette ≥60° hue distance from indigo (#4F46E5)?
2. Do my neutral colors have Chroma ≤ 0.01?
3. Does my typography have ≥2 contrast dimensions?
4. Is there a visual anchor on every screen?
5. Are my core components at L2+? Any at L3?
6. Would a human designer call anything here "lazy"?
7. If I remove the logo, is the brand still recognizable?
