-- SaaS化対応: 各テーブルにuser_idカラムを追加
-- user_idはユーザーを識別するための文字列（UUID形式を想定）

-- 自社情報テーブル
ALTER TABLE company_info ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 分類マスタテーブル
ALTER TABLE categories ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 商品マスタテーブル
ALTER TABLE products ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 取引先マスタテーブル
ALTER TABLE clients ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 見積データテーブル
ALTER TABLE estimates ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 納品データテーブル
ALTER TABLE deliveries ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 請求書テーブル
ALTER TABLE invoices ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- 採番管理テーブル
ALTER TABLE number_sequences ADD COLUMN user_id TEXT DEFAULT 'demo-user-001';

-- user_idでの検索を高速化するためのインデックス
CREATE INDEX IF NOT EXISTS idx_company_info_user ON company_info(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_estimates_user ON estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_number_sequences_user ON number_sequences(user_id);






