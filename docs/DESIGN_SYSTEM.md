# Design system

**Status (2026-11-21):** a token set and primitive component kit are
implemented, derived from `docs/Personal_Life_OS_Design_System_v1.pdf` and the
HTML mockups. A broader visual direction for Home, Finance and Fitness is being
designed separately. **Until that direction is approved, do not restyle
screens, navigation or tokens.** This file records what exists, not what is
proposed.

The code is the source of truth for values: `apps/mobile/design/tokens.ts`.
The tables below summarise it. If they disagree, the code is right and this
file is stale.

## Direction from the PRD

- Calm, modern, minimal personal-productivity product, not a generic admin
  dashboard or a banking template.
- **Finance should feel trustworthy and precise. Fitness should feel motivating
  and practical.** The two modules share primitives but need not feel identical.
- Clear information hierarchy, fast data entry, responsive layouts.
- Humour sparingly, in microcopy only. Financial clarity always comes first.

## Tokens (implemented)

### Colour

Sage-and-paper palette, light and dark, both first-class. Semantic names only;
components never use raw hex.

| Token | Light | Dark |
|---|---|---|
| `backgroundPrimary` | `#F7F4ED` | `#191B19` |
| `backgroundSecondary` | `#F0EEE6` | `#202320` |
| `surfacePrimary` | `#FFFFFF` | `#252825` |
| `surfaceSecondary` | `#F3F1EA` | `#2C302C` |
| `surfaceElevated` | `#FFFFFF` | `#333833` |
| `textPrimary` | `#252820` | `#F2F0E9` |
| `textSecondary` | `#66695F` | `#B5B8AE` |
| `textMuted` | `#85877D` | `#8B9086` |
| `borderPrimary` | `#E8E3D9` | `#383C37` |
| `brandPrimary` | `#687C53` | `#A6B88A` |
| `brandSecondary` | `#A6B48F` | `#80956C` |
| `brandSubtle` | `#E8EBDD` | `#303A2C` |
| `success` | `#4F805B` | `#85B88B` |
| `warning` | `#B88443` | `#D9AB69` |
| `danger` | `#C66E61` | `#E18A7E` |
| `info` | `#6687A1` | `#89AAC3` |
| `onBrand` | `#FFFFFF` | `#191B19` |

### Type

Inter (400/500/600/700). The spec's weight 650 maps to the 600 cut: React
Native only loads discrete weights.

| Role | Size / line height |
|---|---|
| `display` | 32 / 40 |
| `pageHeading` | 26 / 32 |
| `sectionHeading` | 20 / 26 |
| `cardHeading` | 16 / 22 |
| `body` | 14 / 20 |
| `secondary` | 13 / 18 |
| `caption` | 12 / 16 |
| `metric` | 28 / 34 |

### Space, radius, layout

- Space: 8px rhythm with 4px steps (`space[1]`=4 … `space[16]`=64).
- Radius: `sm` 6, `md` 10, `lg` 14, `xl` 20, `pill`.
- Breakpoints: 320 / 375 / 768 / 1024 / 1440. At ≥1024 a sidebar (240,
  collapsed 72) replaces bottom tabs. Content max width 1200.
- Minimum touch target 44.
- Elevation: soft shadows in light only; dark relies on surface contrast and
  borders.
- Motion: hover 140ms, standard 200ms, overlay 220ms, progress 420ms.

### Theme

`design/theme.tsx` provides `system | light | dark`. The preference is
currently stored **per device** (AsyncStorage key `life-os.theme-mode`). The
handoff asks for per user; a proposal to move it to `user_preferences` is
pending.

## Components (implemented)

`apps/mobile/components/ui/`: `Screen`, `Card`, `HeroCard`, `Grid`,
`SectionHead`, `Text`, `Metric`, `Button` (primary / secondary / ghost /
destructive), `Input`, `Select`, `ListRow`, `Badge`, `Pill`/`Tag`,
`ProgressBar`, `Ring`, `BarChart` (react-native-svg), `EmptyState`,
`LoadingState`, `ErrorState`, `SampleNotice`, `FocusRing`.

`components/Themed.tsx` is an Expo template leftover still used by
`+not-found.tsx`. New code uses `components/ui`.

## Constraints already fixed

- **Tabular figures.** Money and weights use `fontVariant: ['tabular-nums']`
  (`Text tabular`) so columns of numbers align and do not shift as values
  change.
- **Indian digit grouping** (₹1,25,000, not ₹125,000) via `Money.formatINR`,
  implemented by hand because Hermes ships a reduced ICU dataset and `Intl`
  grouping is not dependable across web and Android.
- **Compact forms are lossy.** `formatCompactINR` (₹1.25L) is for dense display
  only; never use it for a figure the user must reconcile.
- **State in words, not only colour.** Budget health and similar states carry a
  text label as well as a tone.
- Must work at phone width and desktop width from one tree
  ([D3](./PRODUCT_DECISIONS.md)).

## Known issue: light-theme contrast (do not change tokens yet)

Several light-theme colours fail WCAG AA (4.5:1) for small text. Measured with
the WCAG relative-luminance formula:

| Foreground | on `backgroundPrimary` `#F7F4ED` | on white `#FFFFFF` |
|---|---|---|
| `textMuted` `#85877D` | 3.32:1 | 3.65:1 |
| `warning` `#B88443` | 2.98:1 | 3.27:1 |
| `danger` `#C66E61` | 3.29:1 | 3.62:1 |
| `brandPrimary` `#687C53` | 4.16:1 | 4.57:1 |

Until the token review:

- Do not use `textMuted`, `warning` or `danger` for small text (under 18px
  regular / 14px bold). Use them for icons, borders, fills, or large text, and
  pair a state colour with `textPrimary`/`textSecondary` wording.
- `brandPrimary` as text passes on white surfaces but not on the page
  background.
- `onBrand` white on `brandPrimary` is 4.57:1 and passes.

Dark-theme values have not been audited yet.

## Still open

Chart library beyond the hand-built SVG bar chart (pending an Expo 58 / Skia
compatibility check), icon set, and the module-specific visual direction being
designed now.
