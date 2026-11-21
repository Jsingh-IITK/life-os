-- 0012 — Monthly income and spending.
--
-- Aggregated in SQL rather than by fetching transactions and summing them in
-- the app: a dashboard must not load a year of history to show four numbers,
-- and the PRD is explicit about not doing that.
--
-- Two decisions are encoded here rather than left to the caller:
--
--  * Income counts only lifestyle income. Realized capital gains are income
--    in the ledger and reach net worth, but they are not earnings — counting
--    them would inflate both monthly income and the savings rate with money
--    that was never a salary.
--  * Spending counts only EXPENSE postings, so transfers, card repayments and
--    investment purchases are absent because they post no expense leg. There
--    is no exclusion list to maintain.

create view public.month_summary
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.txn_date)::date as period_month,

  -- Income is credited, so its postings are negative under the
  -- debit-positive convention; negate to report what arrived.
  (-coalesce(sum(p.amount) filter (
      where la.account_class = 'INCOME' and coalesce(c.is_lifestyle, true)
   ), 0))::bigint as income,

  coalesce(sum(p.amount) filter (where la.account_class = 'EXPENSE'), 0)::bigint as expenses,

  -- Reported separately so it can reach wealth views without being mistaken
  -- for earnings.
  (-coalesce(sum(p.amount) filter (
      where la.account_class = 'INCOME' and coalesce(c.is_lifestyle, true) = false
   ), 0))::bigint as realized_gains,

  count(distinct t.id)::integer as transaction_count
from public.transactions t
join public.postings p
  on p.transaction_id = t.id and p.user_id = t.user_id
join public.ledger_accounts la
  on la.id = p.ledger_account_id and la.user_id = t.user_id
left join public.categories c
  on c.ledger_account_id = la.id and c.user_id = t.user_id
where t.deleted_at is null
group by t.user_id, date_trunc('month', t.txn_date)::date;

comment on view public.month_summary is
  'Income and spending per calendar month. Income excludes realized capital '
  'gains, which are reported separately: they belong in net worth, not in '
  'earnings or the savings rate.';

grant select on public.month_summary to authenticated;
