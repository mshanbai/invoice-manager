-- 請求書PDFの保存先と検証用メタデータ
alter table public.invoices
  add column if not exists pdf_path text;

alter table public.invoices
  add column if not exists pdf_size bigint;

alter table public.invoices
  add column if not exists pdf_sha256 text;

alter table public.invoices
  add column if not exists pdf_generated_at timestamptz;

select pg_notify('pgrst', 'reload schema');
