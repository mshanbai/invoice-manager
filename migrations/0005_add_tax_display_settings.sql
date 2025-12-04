-- 消費税表示設定を追加するマイグレーション

-- 自社情報に見積書・納品書の消費税表示設定を追加
ALTER TABLE company_info ADD COLUMN show_tax_on_estimate_delivery INTEGER DEFAULT 0;

-- 取引先マスタに消費税表示設定を追加
-- 'default': 自社設定に従う, 'show': 表示する, 'hide': 表示しない
ALTER TABLE clients ADD COLUMN tax_display_setting TEXT DEFAULT 'default';
