alter table public.invoices
  add column if not exists tax_adjustment numeric default 0;

alter table public.invoices
  add column if not exists tax_adjustment_reason text;

select pg_notify('pgrst', 'reload schema');
