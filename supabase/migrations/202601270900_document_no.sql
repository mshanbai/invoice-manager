create table if not exists public.document_number_sequences (
  doc_type text not null,
  yyyymm text not null,
  current_no integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (doc_type, yyyymm)
);

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
    when 'delivery' then 'D'
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
