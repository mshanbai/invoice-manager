-- 取引先にメモ欄を追加
ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT '';
