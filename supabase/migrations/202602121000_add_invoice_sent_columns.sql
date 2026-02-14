-- 請求書の送付情報を追加（受取ページ追加・メール通知時に保存）
-- sent_at: 送付日時（送付成立時）
-- sent_to_email: 送付先メールアドレス（portal_email優先→email）
alter table public.invoices
  add column if not exists sent_at timestamptz;

alter table public.invoices
  add column if not exists sent_to_email text;

select pg_notify('pgrst', 'reload schema');
