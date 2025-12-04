-- 自社情報にデフォルト振込先インデックスを追加
ALTER TABLE company_info ADD COLUMN default_bank_account_index INTEGER DEFAULT 0;
