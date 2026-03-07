# Engineering Handoff

Translate design specs into implementable engineering contracts.
You know React and Vue — this is about **what to include**, not how frameworks work.

## Handoff Deliverables

Every engineering handoff must contain:

1. **Component tree** — Page → layout → container → presentation hierarchy
2. **State ownership map** — Which state lives where (local / composable / store / server)
3. **Data contract** — API shape, request timing, cache strategy, error handling
4. **Route structure** — Page → URL mapping
5. **Token implementation** — CSS Custom Properties setup, theme switching mechanism

## Component Classification

```
Page components
├── Layout (pure structure, zero logic)
├── Container (data fetching, state management)
│   ├── Presentational (render props/slots)
│   └── Interactive (user input, form handling)
└── Shared (cross-page reuse)
```

## State Management Strategy

| State Type | Scope | React | Vue |
|-----------|-------|-------|-----|
| UI state (toggle/expand) | Component-local | useState | ref |
| Form state | Form component | useForm / useState | useForm composable |
| Server state | Request layer | TanStack Query | VueQuery |
| Cross-component | Context/Provider | useContext | provide/inject |
| Global business | Store | Zustand / Jotai | Pinia |

## Handoff Checklist

- [ ] Component names are self-explanatory, single-responsibility
- [ ] Error boundaries wrap async data components
- [ ] Accessibility: semantic HTML first, ARIA second
- [ ] Performance: virtual lists for 100+ items, lazy load routes/images
- [ ] Tokens mapped to CSS Custom Properties
- [ ] Responsive: Container Queries > Media Queries
- [ ] Motion: respects `prefers-reduced-motion`
- [ ] Form validation strategy unified
- [ ] Error recovery paths complete
