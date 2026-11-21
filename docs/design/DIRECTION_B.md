# Life OS — Direction B "Warm Cards" implementation brief

**For:** Claude Code, working in `Jsingh-IITK/life-os`
**Approved by Jyoti:** 21 November 2026 (Stage 2 decision: Direction B)
**Visual reference:** the Stage 2 canvas, row B (claude.ai/artifact/AQguPzT7J2TzaEiuD24c1u). Figures on the canvas are demo data from the HTML mockup. Never copy them into the app.
**Written against:** commit `9bd39f0`

## Ground rules

1. This brief is the **visual** source of truth. `docs/PRD.md` stays the **functional** source of truth. If they conflict, stop and ask Jyoti.
2. **Do not change any token value** in `apps/mobile/design/tokens.ts`. Direction B uses only existing tokens. The contrast fix is a separate, later step.
3. **Restyle existing components; do not create a second set.** Every item below names the component it changes.
4. **Real data or an honest state.** Where a feature is not built yet (goals, PRs, AI), show the empty or "Unavailable" state. Never show placeholder figures.
5. **Light-theme text rule, until the token review:** small text uses `textSecondary`, never `textMuted`. `warning` and `danger` are allowed for icons, bars and large numbers only, not body text.
6. **State in words as well as colour.** Every status carries an icon or symbol plus a label.
7. Small commits, one per step below. Run `pnpm lint`, `pnpm -r typecheck`, `pnpm -r test` and `pnpm smoke` after each. Add a smoke assertion for anything you fix by looking.

## What makes it "Warm Cards"

- Content sits in **rounded cards** on the paper background. Cards are `surfacePrimary` with a 1px `borderPrimary` border, `radius.lg` (14). In light theme they get the existing `elevation.card` shadow; dark theme gets none.
- Each module page opens with **one hero card**: `brandSubtle` background, `radius.xl` (20), no border. It holds a short, encouraging line plus one key stat or ring.
- **Progress is shown as rings and pill bars**, never as bare percentages.
- **Status pills** are fully rounded (`radius.pill`).
- **Friendly microcopy**, used sparingly: for example "A little progress adds up." or "Nice, one set down." No emoji anywhere in the UI.
- Page-level calls to action (Quick add, Add transaction, Start workout) are **pill-shaped primary buttons**. All other buttons keep `radius.md`.

## Step 0 — Fixes seen in the current app (21 Nov screenshots)

Do these first; they are bugs whatever the direction.
1. **Greeting uses the email handle** ("Good evening, jyotirmay21iitk"). Use the profile display name; if none, just "Good evening". Never show any part of the email address.
2. **Dates show as ISO** ("2026-11-30"). Format as "30 Nov" (add the year only if it is not the current year). Use the same formatter everywhere.
3. **Activity amounts have no sign or type.** "Opening balance ₹34,168" and "Stocks ₹43,000" read as money in or out. Show the type in the meta line (Opening balance, Investment, Transfer) and use "+", "−" or no sign per the rules in Step 2's `ListRow`.
4. **Entries dated 30 Nov appear in "this month" on 21 Nov.** Check whether a future date was entered or a date is being shifted (timezone). If the entry date is genuinely in the future, label it "Scheduled" rather than listing it as past activity.
5. **The Fitness card still says "Not built yet … after Finance is complete."** Fitness sessions now exist (0015). Change to an honest current state, e.g. "No sessions logged yet" with a "Set up your week" action.
6. **Content floats in the middle of wide windows**, leaving a large empty band after the sidebar. Left-align the content column next to the sidebar with `space[8]` padding and keep the max width.

## Step 1 — Shell

**Sidebar (≥1024 px)**: `components/nav/Sidebar.tsx`
- The sidebar becomes a floating card: 16 px inset from the window edges, `radius.xl`, `surfacePrimary`, border, light-theme shadow. Width stays `SIDEBAR_WIDTH`.
- Logo: a 28 px `brandPrimary` circle, then the wordmark at 15 px / 600.
- Nav items: min height 40 (44 on touch), `radius` 12. Active item: `brandSubtle` background, `textPrimary`, weight 600. Inactive: `textSecondary`. Hover: `surfaceSecondary`.
- Keep the existing "Coming later" group (Routines, Journal) at 55% opacity with a "Soon" label. The label is 11 px / 600 caps with letter-spacing, in `textSecondary`.
- Settings stays pinned at the bottom.

**Bottom nav (<1024 px)**: `components/nav/BottomNav.tsx`
- Floating bar: 12 px inset from the sides and bottom, plus the safe-area inset. `radius.xl`, `surfacePrimary`, border, light-theme shadow, 4 px inner padding.
- Keep the same five tabs. Each tab is at least 56 px tall, icon 22 px, label 11 px. Active tab: `brandPrimary`, label weight 600.

**Page**: `components/ui/Screen.tsx`
- Gap between cards: `space[4]` (16).
- Header row: an eyebrow (caption, 600, caps, `textSecondary`) on the left; the demo marker (previews only) and one pill CTA on the right.

## Step 2 — Components

| Component | Change |
|---|---|
| `HeroCard` | `radius.xl`, `brandSubtle`, **no border**. Padding 28×32 on desktop, 20 on mobile. Title in `display` (32/40) on desktop and 24/30 on mobile. Body 14/21 in `textSecondary`, max width about 520. Right side holds an optional slot for a stat, a `Ring`, or a "focus" chip (a `surfacePrimary` box, `radius.lg`). Below 768 px the slot stacks under the text. |
| `Card` (standard, metric) | `radius.lg`, border, light shadow, padding `space[5]` (20; the canvas used 18–22). |
| `Metric` | Label 13 in `textSecondary`, value in `metric` (28) tabular, then an optional `Pill` underneath. |
| `Pill` | `radius.pill`, 12 px text, padding 2×8 (3×10 on rows). **Neutral** tone: `surfaceSecondary` with `textSecondary`. **Positive** tone: `brandSubtle` with `textPrimary` and a leading check. **Active** tone: `brandPrimary` with `onBrand` and a leading dot. |
| `Ring` | 100-unit viewBox, stroke 10, track `surfaceSecondary`, value `brandPrimary` with a round cap, label centred. Sizes 104–120 on cards and 64 inside the rest timer. Needs `accessibilityLabel` text such as "68% of budget used". |
| `ProgressBar` | 8 px pill bar, track `surfaceSecondary`. Complete = `success` plus a "✓" in the label. |
| `ListRow` (activity) | A 36 px leading tile (`radius` 12, `surfaceSecondary`) showing a **2-letter category code** in 11–12 px / 600 `textSecondary`. This replaces emoji. Title 14 / 500, meta line 12 in `textSecondary`, amount tabular on the right. Income shows "+" and `success` / 600. Expenses show "−" in `textPrimary`. Workout rows end with a positive `Pill` such as "✓ Completed". |
| **New: `WeekStrip`** | Seven columns, each a day label (11 px caps) over a 36 px circle. **Done**: filled `brandPrimary` with a check in `onBrand`. **Today**: 2 px `brandPrimary` ring with the date. **Planned**: 1 px border with the date in `textSecondary`. **Rest**: dashed `textSecondary` border with the word "Rest". Needs real `missed` support before it can show missed days. Until then, do not show past planned days as anything except planned. |
| **New: `ScheduleRow`** (Fitness) | `radius` 12, padding 8×12. **Done**: `surfaceSecondary` fill with positive pill "✓ Done". **Today**: 2 px `brandPrimary` border with active pill "● Today". **Upcoming**: 1 px border with "○ Upcoming". **Rest**: dashed border with "Rest day". |
| `BarChart` / new donut | Category donut: stroke 12, legend required (swatch, name and amount for every segment). **Interim category colours**: `brandPrimary`, `brandSecondary`, `info`, `warning`, then `borderPrimary` for "Everything else". The proper category palette is an open item. |

## Step 3 — Home (`app/(tabs)/index.tsx`)

Order, top to bottom:
1. Header: date eyebrow and a "Quick add" pill CTA.
2. **Hero card**: a greeting line and one sentence built only from real figures, for example "2 sessions to go this week". Show the stat or ring slot only when that figure exists.
3. **Four metric cards** in a grid: Monthly income, Spent so far (with "of ₹X planned" when a budget exists), Set aside, Workouts this week. Grid columns are 4 at ≥1024, 2 at 375–1023 and 2 below that, with smaller values.
4. **Two cards side by side** (stacking below 768):
   - **Money overview**: budget `Ring`, "₹X left of ₹Y", and an "Open finance →" link.
   - **This week's training**: `WeekStrip`, a "Next up" line, and an "Open fitness →" link.
5. **Recent activity** card: mixed transactions and workouts, using `ListRow`.

First run: keep the existing setup state, restyled as a hero card with one primary action.

## Step 4 — Finance (`app/(tabs)/finance.tsx`)

1. Header: "FINANCE" eyebrow, page title, a Month / Year segmented control (pill track `surfaceSecondary`, selected item `surfacePrimary`), and an "Add transaction" pill CTA.
2. **Four metric cards**: Monthly income, Spent so far, Savings rate, Net worth. Net worth already shows a real figure (assets minus liabilities); keep it, and show "Unavailable" only when no account has a balance. How savings rate is defined is still open decision D4 in the Stage 1 doc. Use whatever `month_summary` defines and label it exactly.
3. **Two columns** (stacking below 1024):
   - Left: **Spending overview** card. Donut, legend, then a `surfaceSecondary` note box: "₹X left of your ₹Y plan. Transfers and investments are tracked separately from lifestyle spending."
   - Right: **Recent transactions** card (`ListRow`, "View all →"). Below it, the **Goals** card only when goals exist. Otherwise leave it out; don't show an empty goals card.

## Step 5 — Fitness (`app/(tabs)/fitness.tsx`)

Build after the session-lifecycle work is wired to the UI. Use only real sessions.
1. **Hero card**: "Build strength. Keep showing up." with a "Start {today's session} →" pill CTA and a sessions `Ring` (completed of planned).
2. **Four metric cards**: Sessions this week, Training time, Last 4 weeks, Plan adherence. Plan adherence appears only once its definition is agreed (D6).
3. **Two columns**: "Your planned week" (`ScheduleRow` × 7) | Today's workout card (first 3 exercises, then "+ N more") and a **Strength highlights** card. Highlights is a three-up grid of tiles; an unlogged lift gets a dashed tile reading "Not logged".

## Step 6 — Live workout logging (when built)

From the canvas, phone B, third screen:
- Status pill at the top: "● {session} · in progress".
- An exercise card showing "Exercise n of N", the name in 24/30, and the target plus last-time line.
- One set row per set (`radius` 14, padding 10×12):
  - Done: `brandSubtle` background with a 44 px filled check circle.
  - Active: 2 px `brandPrimary` border.
  - Not started: 1 px border.
- Rest timer panel: `brandSubtle`, `radius.xl`, a 64 px ring, the time in 26 / 600 tabular, and a "+30s" button.
- Bottom actions: two 52 px pill buttons, "Next exercise" and "Finish".
- Everything is reachable with one thumb; all targets are at least 44 px.

## Acceptance checks

- [ ] Light and dark both match row B of the canvas, including the dark Fitness screen.
- [ ] Every number on screen comes from the database or is shown as unavailable or empty.
- [ ] No emoji in the UI.
- [ ] No small text uses `textMuted` in the light theme.
- [ ] Every status shows a symbol and a word, not colour alone.
- [ ] Sidebar at ≥1024 px and floating bottom nav below it; no horizontal scroll at 320 px.
- [ ] Every touch target is at least 44 px.
- [ ] Existing smoke assertions still pass, and new ones cover hero, metric grid and nav at desktop and phone widths.

## Open items (not for this brief)

- Token review for light-theme contrast (`textMuted`, `warning`, `danger`, `brandPrimary` on the paper background).
- Category colour palette.
- D4 savings definition, D6 adherence and streaks, and the `missed` session status.
