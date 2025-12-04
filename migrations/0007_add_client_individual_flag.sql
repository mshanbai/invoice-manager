-- 取引先に個人フラグを追加
-- is_individual = 1 の場合、請求書で「様」を使用（デフォルトは「御中」）

ALTER TABLE clients ADD COLUMN is_individual INTEGER DEFAULT 0;
