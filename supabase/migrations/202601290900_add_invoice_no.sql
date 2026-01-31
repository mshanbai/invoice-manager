alter table public.invoices
  add column if not exists invoice_no text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name = 'invoice_number'
  ) then
    update public.invoices
      set invoice_no = invoice_number
    where invoice_no is null
      and invoice_number is not null;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
