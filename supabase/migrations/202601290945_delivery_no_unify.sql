alter table public.deliveries
  add column if not exists delivery_no text;

alter table public.deliveries
  add column if not exists delivery_no_legacy text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deliveries'
      and column_name = 'delivery_number'
  ) then
    update public.deliveries
      set delivery_no = delivery_number
    where delivery_no is null
      and delivery_number is not null;
  end if;
end $$;

update public.deliveries
  set delivery_no_legacy = delivery_no
where delivery_no_legacy is null
  and delivery_no is not null
  and delivery_no !~ E'^DEL\\d{6}-\\d{3}$';

with targets as (
  select
    id,
    to_char(coalesce(delivery_date, created_at::date, now()::date), 'YYYYMM') as yyyymm,
    row_number() over (
      partition by to_char(coalesce(delivery_date, created_at::date, now()::date), 'YYYYMM')
      order by delivery_date nulls last, id
    ) as rn
  from public.deliveries
  where delivery_no is null
     or delivery_no !~ E'^DEL\\d{6}-\\d{3}$'
)
update public.deliveries d
  set delivery_no = 'DEL' || targets.yyyymm || '-' || lpad(targets.rn::text, 3, '0')
from targets
where d.id = targets.id;

with max_seq as (
  select
    to_char(coalesce(delivery_date, created_at::date, now()::date), 'YYYYMM') as yyyymm,
    max((regexp_match(delivery_no, E'^DEL\\d{6}-(\\d{3})$'))[1]::int) as max_no
  from public.deliveries
  where delivery_no ~ E'^DEL\\d{6}-\\d{3}$'
  group by 1
)
insert into public.document_number_sequences (doc_type, yyyymm, current_no)
select 'delivery', yyyymm, max_no
from max_seq
on conflict (doc_type, yyyymm) do update
set current_no = greatest(public.document_number_sequences.current_no, excluded.current_no),
    updated_at = now();

create or replace function public.next_document_no(doc_type text, doc_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yyyymm text;
  v_next integer;
  v_prefix text;
begin
  v_yyyymm := to_char(doc_date, 'YYYYMM');

  v_prefix := case doc_type
    when 'estimate' then 'E'
    when 'delivery' then 'DEL'
    when 'invoice'  then 'INV'
    else upper(left(doc_type, 1))
  end;

  perform pg_advisory_xact_lock(hashtext(next_document_no.doc_type || ':' || v_yyyymm));

  insert into public.document_number_sequences (doc_type, yyyymm, current_no)
  values (next_document_no.doc_type, v_yyyymm, 1)
  on conflict (doc_type, yyyymm)
  do update set
    current_no = public.document_number_sequences.current_no + 1,
    updated_at = now()
  returning current_no into v_next;

  return v_prefix || v_yyyymm || '-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function public.next_document_no(text, date) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
