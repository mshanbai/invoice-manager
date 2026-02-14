-- 受取ページ用テーブル（送付成立時に upsert）
-- invoice_id はユニーク（再送でも重複しない）
create table if not exists public.portal_invoices (
  id bigserial primary key,
  invoice_id integer not null unique references public.invoices(id) on delete cascade,
  client_id integer not null references public.clients(id) on delete cascade,
  user_id text not null,
  company_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_invoices_user on public.portal_invoices(user_id);
create index if not exists idx_portal_invoices_client on public.portal_invoices(client_id);

select pg_notify('pgrst', 'reload schema');
