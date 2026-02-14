-- 取引先マスタに「帳票受け取りメール」を追加
-- 請求書など帳票の受け取り通知を送る宛先（未入力の場合は既存のメールアドレスを使用）
alter table public.clients
add column if not exists portal_email text;
