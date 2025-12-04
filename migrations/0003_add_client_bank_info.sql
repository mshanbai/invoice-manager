-- 取引先マスタに銀行情報を追加

ALTER TABLE clients ADD COLUMN bank_name TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN bank_branch TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN bank_account_type TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN bank_account_number TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN bank_account_holder TEXT DEFAULT '';
