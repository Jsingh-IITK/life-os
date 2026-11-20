# Design system

**Status:** not yet designed. The PRD gives direction but does not lock a visual
system, and explicitly asks for a cohesive proposal before the full UI is built.
That proposal happens in Phase 1 — this file is where it will be recorded.

Phase 0 ships an unstyled shell deliberately: five tabs and honest placeholders,
so nothing implies functionality that does not exist.

## Direction from the PRD

- Calm, modern, minimal personal-productivity product — not a generic admin
  dashboard, not a banking template.
- **Finance should feel trustworthy and precise. Fitness should feel motivating
  and practical.** The two modules share primitives but need not feel identical.
- Clear information hierarchy, fast data entry, responsive layouts.
- Humour sparingly, in microcopy only. Financial clarity always comes first.

## Constraints already fixed

- **Tabular figures.** Money and weights must use `fontVariant: ['tabular-nums']`
  so columns of numbers align and do not shift as values change.
- **Indian digit grouping** (₹1,25,000, not ₹125,000) via
  `Money.formatINR` — implemented by hand because Hermes ships a reduced ICU
  dataset and `Intl` grouping is not dependable across web and Android.
- **Compact forms are lossy.** `formatCompactINR` (₹1.25L) is for dense display
  only; never use it for a figure the user must reconcile.
- Light and dark must both be first-class — theming is wired through
  `components/Themed.tsx` from Phase 0.
- Must work at phone width and desktop width from one tree
  ([D3](./PRODUCT_DECISIONS.md)).

## To decide in Phase 1

Type scale, colour palette and semantic tokens, spacing scale, elevation,
component inventory, empty/loading/error state patterns, chart library
(pending an Expo 58 / Skia compatibility spike), icon set.
