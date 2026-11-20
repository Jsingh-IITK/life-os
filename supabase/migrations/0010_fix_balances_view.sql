-- 0010 — An account with only deleted transactions must still show zero.
--
-- The previous view filtered deleted transactions with a WHERE clause, which
-- removed the account's entire row rather than excluding the posting from its
-- sum. An account whose only transaction had been deleted therefore vanished
-- from the balances list instead of reading ₹0 — so soft-deleting your one
-- transaction made the account disappear from the UI.
--
-- Using an aggregate FILTER keeps the row and excludes the amount, which is
-- what "this account has no live postings" should mean.

create or replace view public.account_balances
with (security_invoker = true)
as
select
  la.user_id,
  la.id            as ledger_account_id,
  la.account_class,
  la.name,
  la.parent_id,
  coalesce(sum(p.amount) filter (where t.deleted_at is null), 0)::bigint as debit_balance,
  (case
     when la.account_class in ('ASSET', 'EXPENSE')
       then coalesce(sum(p.amount) filter (where t.deleted_at is null), 0)
     else -coalesce(sum(p.amount) filter (where t.deleted_at is null), 0)
   end)::bigint as natural_balance
from public.ledger_accounts la
left join public.postings p
       on p.ledger_account_id = la.id
      and p.user_id = la.user_id
left join public.transactions t
       on t.id = p.transaction_id
      and t.user_id = p.user_id
group by la.user_id, la.id, la.account_class, la.name, la.parent_id;

comment on view public.account_balances is
  'Balance per account, derived from postings of live transactions. Every '
  'account appears, including those whose only postings are deleted — they '
  'read zero rather than disappearing.';

grant select on public.account_balances to authenticated;
