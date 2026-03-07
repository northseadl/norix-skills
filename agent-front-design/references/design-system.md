# Design System Engineering

Token architecture and modern CSS guidance for implementation.
Only the judgment and structure you need — not CSS tutorials.

## Token Architecture (3-Layer)

### Layer 1: Primitives
Raw values. No semantics. Use OKLCH for color.

```css
--color-brand-{50..900}:  oklch(lightness chroma hue);
--space-{1,2,3,4,6,8,12,16}: rem values on 4px grid;
--text-{xs,sm,base,lg,xl,2xl,3xl,4xl}: type scale;
--radius-{sm,md,lg,xl,full}: corner rounding;
--shadow-{sm,md,lg}: elevation;
--duration-{fast,normal,slow}: 100/200/400ms;
```

### Layer 2: Semantic Tokens
Map primitives to meaning. Theme switching only touches this layer.

```css
:root {
  --color-surface:          var(--color-neutral-50);
  --color-surface-elevated: var(--color-neutral-0);
  --color-text-primary:     var(--color-neutral-900);
  --color-text-secondary:   var(--color-neutral-600);
  --color-text-muted:       var(--color-neutral-400);
  --color-border:           var(--color-neutral-200);
  --color-accent:           var(--color-brand-500);
  /* --color-success, --color-warning, --color-error, --color-info */
}

[data-theme="dark"] { /* override semantic tokens only */ }
```

### Layer 3: Component Tokens
Component-specific, referencing semantic layer.

```css
--button-primary-bg:   var(--color-accent);
--card-bg:             var(--color-surface-elevated);
--card-shadow:         var(--shadow-md);
--input-border-focus:  var(--color-accent);
```

### Naming Convention
`--{category}-{property}-{variant?}-{state?}`

Categories: `color`, `space`, `text`, `radius`, `shadow`, `duration`, `easing`

## Token Rules

1. No magic numbers — all values reference tokens
2. Semantic over primitive — components use semantic layer
3. Theme neutral — component logic never checks theme
4. Single source — one semantic = one token

## Modern CSS to Prefer

Use native CSS capabilities over JS libraries when possible:

| Technique | Use For | Over |
|-----------|---------|------|
| Container Queries | Component-level responsive | Viewport media queries |
| View Transitions | Page/route transitions | JS animation libraries |
| Scroll-Driven Animations | Parallax, reveal effects | IntersectionObserver |
| Anchor Positioning | Tooltips, dropdowns | Popper.js |
| `:has()` | Parent-aware styling | JS class toggling |
| `@layer` | Cascade control | Specificity hacks |
| `light-dark()` | Theme values | JS theme detection |
| `text-wrap: balance` | Heading line breaks | Manual breaks |
| OKLCH `color-mix()` | Dynamic color variants | Preprocessor functions |

## Performance Budget

| Metric | Target |
|--------|--------|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| Critical CSS | ≤ 50KB |
| Critical JS | ≤ 100KB |
