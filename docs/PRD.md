# Product requirements

**Source of truth:** [`Personal_Life_OS_Handoff_v3.pdf`](./Personal_Life_OS_Handoff_v3.pdf)
— Personal Life OS Claude Code Handoff v3.0, 20 November 2026.

[`Moneypilot_PRD_v2.1_superseded.pdf`](./Moneypilot_PRD_v2.1_superseded.pdf) is
retained for provenance. v3.0 supersedes it by reframing Moneypilot as the
*Finance module* of a broader product rather than the product itself. Where v3.0
is merely **silent** and v2.1 was **stricter**, we keep v2.1's rigour — notably
its 18 named invariant tests, XIRR insufficiency gating, and the requirement
that safe-to-spend explain how it was derived. v3.0 does not repudiate these,
and they are what make the numbers trustworthy.

## Shape of the product

One app, two first-class modules over a shared shell.

| Area | Status | Purpose |
|---|---|---|
| Home / Overview | Foundation | Unified snapshot, quick actions, module entry |
| **Finance** | Build first | Income, expenses, accounts, budgets, wealth, insights |
| **Fitness** | Build second | Training plan, workout diary, progress, goals |
| Habits / Routines | Later — **do not build** | Recurring habits, streaks, reminders |
| Journal | Later — **do not build** | Private entries, reflections, mood |
| Shared AI | Foundation, expand later | Intent routing, validated actions |

## Principles

1. Useful before comprehensive — a reliable Finance workflow before breadth.
2. Modules are first-class: independent data models, workflows and analytics.
3. Shared shell, separate domains.
4. **AI assists; deterministic code decides.**
5. Multi-user-ready from day one.
6. Financial accuracy before visual presentation.

## Accounting invariants

These must never be violated. See
[`PRODUCT_DECISIONS.md#d2`](./PRODUCT_DECISIONS.md) for how double-entry makes
them structural rather than conventional.

- Internal transfers are neither expense nor income.
- Investment contributions move value from cash to an asset; they are not
  lifestyle expenses.
- A credit-card purchase is expenditure **when purchased**. Paying the card
  settles a liability and must not create a second expense.
- Refunds reverse or adjust the original expense.
- EPF deductions and employer contributions must not be double-counted.
- An emergency fund is a *designation* of existing bank assets, never an
  additional asset.
- Net worth = total assets − total liabilities.
- Investment valuations preserve historical snapshots; partial sales preserve
  remaining cost basis.

## Non-goals for the first release

Habits; Journal; automatic bank syncing; live market or NAV feeds; social
features; microservices or event-driven infrastructure; AI performing financial
arithmetic or mutating arbitrary records.

## Seed configuration

Illustrative and **per-user editable** — never a global default or migration
literal. Monthly take-home ₹1,25,000; next-FY ₹1,30,000; committed expenses
₹70,500; savings target ₹35,000; travel ₹5,000; eating out ₹6,000; shopping
₹3,000; buffer ₹5,500.

## Build order

Phase 0 repo and rails → Phase 1 shared foundation → Phases 2–4 Finance MVP
(core, wealth, conversational) → Phase 5 Fitness MVP → Phase 6 advanced and
cross-module. See [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md).
