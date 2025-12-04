-- 見積有効期限のデフォルト日数を追加
ALTER TABLE company_info ADD COLUMN estimate_valid_days INTEGER DEFAULT 30;
