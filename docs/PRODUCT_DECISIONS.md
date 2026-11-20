# Product and architecture decisions

A running record of decisions, each with the reason it was made. Later phases
should not quietly reverse one of these without replacing the reasoning.

---

## D1 — Money is stored as integer paise

**Decision:** all monetary amounts are whole paise in a `BIGINT` column
(`public.paise` domain), read into TypeScript through
`Money.fromDatabase()`.

**Why:** ₹0.01 has no exact binary floating-point representation, so float
rupees accumulate error over any realistic number of transactions. The PRD
permits paise *or* `NUMERIC`; paise was chosen because the Supabase client
returns `NUMERIC` as a string, and any careless `Number()` coercion
reintroduces exactly the float error the PRD forbids. Integers have no such
failure mode.

**Bound:** `Number.MAX_SAFE_INTEGER` is 9,007,199,254,740,991 paise ≈ ₹90.07
trillion. Every constructor and arithmetic result is range-checked, so overflow
throws rather than silently losing precision.

---

## D2 — Finance uses double-entry postings

**Decision:** a transaction is a header plus two or more postings, constrained
so the postings sum to zero. A single `ledger_accounts` chart of accounts is the
only foreign-key target for postings.

**Why:** the PRD's accounting invariants are stated as rules that must never be
violated. Modelled as single rows with a `type` column, each invariant becomes a
code-level convention that must hold in every query — and drifts as features are
added. Modelled as balanced postings, they become structural:

| Invariant | Why it cannot be violated |
|---|---|
| Transfers are not expenses | asset→asset; no EXPENSE leg exists |
| Card repayment must not double-count expenditure | DR Liability, CR Asset; no EXPENSE leg exists |
| Investment contributions are not lifestyle expenses | DR Asset:Investment, CR Asset:Bank |
| Gains are not income transactions | unrealized gains are never posted at all |

**Cost:** more modelling upfront, and all writes must go through a single
`post_transaction` RPC because the Supabase client cannot open a multi-statement
transaction.

---

## D3 — One Expo tree for Android and Web, not two apps

**Decision:** `apps/mobile` is a single Expo Router app serving Android
(priority) and Web. There is no separate `apps/web`.

**Why:** PRD v3.0 §8 sketches `apps/(web, mobile)`, but also says to adapt
rather than reorganise blindly, and to be useful before comprehensive. Two
presentation layers roughly double the UI work per feature, which for a
single-developer build is the difference between shipping Finance and not. All
domain logic lives in shared packages, so adding a dedicated web app later is
additive rather than a rewrite.

**Revisit if:** desktop data entry (bulk transaction or workout logging with a
keyboard) becomes a primary workflow and Expo Web's ergonomics limit it.

---

## D4 — Emergency fund is a sub-account, not a flag

**Decision:** a designated emergency fund is a child ledger account under its
bank account. Net worth sums **leaf** accounts only; parents are presentation
rollups.

**Why:** the PRD's own example is ₹1,00,000 in a bank account of which ₹50,000
is designated emergency savings, where total bank assets must remain
₹1,00,000. A boolean flag on the account cannot express *partial* designation at
all, and a separate emergency-fund balance invites double counting. As a
sub-account the arithmetic cannot go wrong, because the money is only ever in
one leaf. `emergency_fund_settings` holds targets and coverage config with zero
balance authority.

---

## D5 — `liability_transactions` is a view, not a table

**Decision:** the PRD lists `liability_transactions` among its entities. It is
implemented as a view over postings to the relevant liability account.

**Why:** a real table would be a second source of truth for a credit-card
balance, competing with the postings that already determine it. Two sources of
truth for one number is precisely the class of bug the double-entry model exists
to remove.

---

## D6 — Integer measures for training data too

**Decision:** weights are whole **grams**, durations whole **seconds**,
distances whole **metres**, with matching database domains.

**Why:** the no-float rule is not finance-specific. Training volume is a sum of
(weight × reps) over thousands of sets, and plate increments are fractional in
kilograms (2.5kg, 1.25kg micro-plates). The drift is identical in kind to
money's; so is the fix.

---

## D7 — Workout sessions snapshot their template

**Decision:** on starting a session, target sets/reps/weight/rest are copied
into `workout_session_exercises`. The session never reads live template values.

**Why:** the PRD requires that editing an in-progress workout must not silently
change its saved template, and that rescheduling or skipping must not rewrite
history. Snapshotting makes history immutable by construction — the same
principle as append-only `valuation_snapshots` in Finance.

---

## D8 — AI provider deferred; abstraction built first

**Decision:** Phase 1 defines the provider interface, the typed tool registry
and Zod validation, with a deterministic local stub as the first implementation.
A real provider is selected in Phase 4.

**Why:** the PRD asks for a provider-independent abstraction and explicitly says
to confirm pricing, free-tier limits and data-use terms *before* sending real
financial data. Deferring the choice costs nothing because the stub makes every
AI-dependent path testable, and it avoids committing to a provider before that
review happens.

**Recorded explicitly:** a consumer Gemini subscription grants **no** API
access, and Claude Code subscription access is development tooling, not backend
API access. Neither can be treated as a backend credential.

---

## D9 — Module isolation is enforced by the build

**Decision:** `finance-core` and `fitness-core` import neither each other nor
Supabase, React, or Node builtins. `eslint.config.mjs` fails the build on
violation.

**Why:** the PRD requires that a fitness request cannot retrieve financial
information. Stated as a policy it degrades; stated as a lint rule it holds.
Note that flat config *replaces* a same-named rule rather than merging options,
so all restrictions for a file pattern are composed into one entry — an earlier
version of this config silently disabled the no-I/O rule, which is why the
boundary rules have verification probes.

---

## D10 — TypeScript pinned to 6.0.3

**Decision:** the whole monorepo uses TypeScript 6.0.3.

**Why:** the Expo 58 template pins `~6.0.3` and validates its shipped types
against TS 6. TypeScript 7 is the native port, with only 7.0.2 stable. Running
two compiler majors across one repo, or putting Expo's types on an unvalidated
compiler, buys nothing here — the core packages use no TS 7-specific features.

**Revisit when:** Expo supports TS 7.

---

## Open decisions

| # | Question | Needed by | Current assumption |
|---|---|---|---|
| O1 | Payroll mode: gross or net salary? Determines whether EPF deductions post a bank leg. | Phase 2 (`income_sources`) | **Net** — the seed figure is stated as take-home |
| O2 | Final product name and branding | Before any public release | `life-os` is the repo name only |
| O3 | Design system | Phase 1 | To be proposed, not invented silently |
| O4 | Chart library | Phase 2 (first analytics) | Pending an Expo 58 / Skia compatibility spike |
