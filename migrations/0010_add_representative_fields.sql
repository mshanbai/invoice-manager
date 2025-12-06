-- company_info テーブルに不足しているカラムを追加

-- 代表者情報
ALTER TABLE company_info ADD COLUMN representative_title TEXT;
ALTER TABLE company_info ADD COLUMN representative_name TEXT;

-- ロゴ・印鑑
ALTER TABLE company_info ADD COLUMN logo_url TEXT;
ALTER TABLE company_info ADD COLUMN stamp_url TEXT;

-- 複数銀行口座対応
ALTER TABLE company_info ADD COLUMN bank_accounts TEXT;

-- 税金設定
ALTER TABLE company_info ADD COLUMN default_tax_type TEXT DEFAULT 'standard';
ALTER TABLE company_info ADD COLUMN default_tax_rate REAL DEFAULT 10;

-- 締め日・支払日デフォルト
ALTER TABLE company_info ADD COLUMN default_closing_day TEXT;
ALTER TABLE company_info ADD COLUMN default_payment_day TEXT;

-- 納品書フォーマット設定
ALTER TABLE company_info ADD COLUMN delivery_note_format TEXT DEFAULT 'half';

