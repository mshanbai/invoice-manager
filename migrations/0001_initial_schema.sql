-- SmartBill データベーススキーマ
-- 初期マイグレーション

-- =====================
-- 自社情報テーブル
-- =====================
CREATE TABLE IF NOT EXISTS company_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,                    -- 会社名
  department_name TEXT,                          -- 部署名
  person_name TEXT,                              -- 担当者名
  postal_code TEXT,                              -- 郵便番号
  address TEXT,                                  -- 住所
  address_number TEXT,                           -- 番地
  building_name TEXT,                            -- ビル名等
  tel TEXT,                                      -- TEL
  fax TEXT,                                      -- FAX
  email TEXT,                                    -- Mail
  website TEXT,                                  -- HP
  invoice_registration_no TEXT,                  -- 適格請求書No
  bank_name TEXT,                                -- 振込先銀行
  bank_branch TEXT,                              -- 支店名
  account_type TEXT,                             -- 口座種別（普通/当座）
  account_number TEXT,                           -- 口座番号
  account_holder TEXT,                           -- 口座名義
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 分類マスタテーブル
-- =====================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,            -- 分類名
  tax_rate REAL DEFAULT 10,                      -- 税率（デフォルト10%）
  display_order INTEGER DEFAULT 0,               -- 表示順
  is_active INTEGER DEFAULT 1,                   -- 有効フラグ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 商品マスタテーブル
-- =====================
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL,                    -- 商品名
  product_code TEXT,                             -- 商品番号
  jan_code TEXT,                                 -- JANコード
  category_id INTEGER,                           -- 分類ID
  unit_price REAL DEFAULT 0,                     -- 単価（通常価格・下代）
  cost_price REAL DEFAULT 0,                     -- 原価
  retail_price REAL DEFAULT 0,                   -- 上代（定価）
  discount_rate REAL DEFAULT 100,                -- 掛け率（%）上代×掛け率÷100=下代
  tax_rate REAL,                                 -- 商品別税率（NULLの場合は分類の税率を使用）
  min_lot INTEGER DEFAULT 1,                     -- 最小ロット
  is_wholesale INTEGER DEFAULT 0,                -- 上代・下代商品フラグ（0:通常, 1:上代・下代あり）
  is_active INTEGER DEFAULT 1,                   -- 有効フラグ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- =====================
-- 取引先マスタテーブル
-- =====================
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,                     -- 取引先名
  department_name TEXT,                          -- 部署名
  postal_code TEXT,                              -- 郵便番号
  address TEXT,                                  -- 住所
  address_number TEXT,                           -- 住所番地
  building_name TEXT,                            -- ビル名等
  client_code TEXT,                              -- 取引先管理コード
  person_name TEXT,                              -- 担当者名
  email TEXT,                                    -- メールアドレス
  closing_day TEXT,                              -- 締め日（数値 or "末日"）
  payment_day TEXT,                              -- 支払い期日（数値 or "翌月末"）
  use_wholesale_price INTEGER DEFAULT 0,         -- 上代・下代設定（0:いいえ, 1:はい）
  is_active INTEGER DEFAULT 1,                   -- 有効フラグ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 見積データテーブル
-- =====================
CREATE TABLE IF NOT EXISTS estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_no TEXT NOT NULL,                     -- 見積書番号（ES24-101-1128形式）
  estimate_date DATE NOT NULL,                   -- 見積日
  client_id INTEGER NOT NULL,                    -- 取引先ID
  valid_until DATE,                              -- 有効期限
  subtotal REAL DEFAULT 0,                       -- 小計
  tax_amount REAL DEFAULT 0,                     -- 消費税額
  total_amount REAL DEFAULT 0,                   -- 合計金額
  notes TEXT,                                    -- 備考
  status TEXT DEFAULT 'draft',                   -- ステータス（draft, sent, accepted, rejected）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- =====================
-- 見積明細テーブル
-- =====================
CREATE TABLE IF NOT EXISTS estimate_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,                  -- 見積ID
  product_id INTEGER,                            -- 商品ID（手入力の場合はNULL）
  product_name TEXT NOT NULL,                    -- 商品名
  jan_code TEXT,                                 -- JANコード
  quantity INTEGER DEFAULT 1,                    -- 数量
  unit_price REAL DEFAULT 0,                     -- 単価（下代）
  retail_price REAL DEFAULT 0,                   -- 上代（定価）
  use_retail_price INTEGER DEFAULT 0,            -- 上代表示フラグ
  tax_rate REAL DEFAULT 10,                      -- 税率
  amount REAL DEFAULT 0,                         -- 金額（数量×単価）
  notes TEXT,                                    -- 備考
  display_order INTEGER DEFAULT 0,               -- 表示順
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- =====================
-- 納品データテーブル
-- =====================
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_no TEXT NOT NULL,                     -- 納品書番号（DS24-101-1128形式）
  delivery_date DATE NOT NULL,                   -- 納品日
  client_id INTEGER NOT NULL,                    -- 取引先ID
  subtotal REAL DEFAULT 0,                       -- 小計
  tax_amount REAL DEFAULT 0,                     -- 消費税額
  total_amount REAL DEFAULT 0,                   -- 合計金額
  notes TEXT,                                    -- 備考
  estimate_id INTEGER,                           -- 紐付け見積ID（あれば）
  invoice_id INTEGER,                            -- 紐付け請求書ID（請求済みの場合）
  status TEXT DEFAULT 'draft',                   -- ステータス（draft, issued, invoiced）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (estimate_id) REFERENCES estimates(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- =====================
-- 納品明細テーブル
-- =====================
CREATE TABLE IF NOT EXISTS delivery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL,                  -- 納品ID
  product_id INTEGER,                            -- 商品ID（手入力の場合はNULL）
  product_name TEXT NOT NULL,                    -- 商品名
  jan_code TEXT,                                 -- JANコード
  category_id INTEGER,                           -- 分類ID
  quantity INTEGER DEFAULT 1,                    -- 数量
  unit_price REAL DEFAULT 0,                     -- 単価（下代）
  tax_rate REAL DEFAULT 10,                      -- 税率
  amount REAL DEFAULT 0,                         -- 金額（数量×単価）
  notes TEXT,                                    -- 備考
  display_order INTEGER DEFAULT 0,               -- 表示順
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- =====================
-- 請求書テーブル
-- =====================
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL,                      -- 請求書番号（MS24-101-08形式）
  invoice_date DATE NOT NULL,                    -- 請求日
  client_id INTEGER NOT NULL,                    -- 取引先ID
  billing_period_start DATE,                     -- 請求対象期間開始
  billing_period_end DATE,                       -- 請求対象期間終了
  closing_date DATE,                             -- 締め日
  payment_due_date DATE,                         -- 支払い期限
  subtotal REAL DEFAULT 0,                       -- 小計
  tax_amount REAL DEFAULT 0,                     -- 消費税額
  total_amount REAL DEFAULT 0,                   -- 合計金額
  notes TEXT,                                    -- 備考
  status TEXT DEFAULT 'draft',                   -- ステータス（draft, issued, paid）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- =====================
-- 請求明細テーブル
-- =====================
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,                   -- 請求書ID
  delivery_id INTEGER,                           -- 紐付け納品ID
  delivery_date DATE,                            -- 納品日
  product_name TEXT NOT NULL,                    -- 商品名
  quantity INTEGER DEFAULT 1,                    -- 数量
  unit_price REAL DEFAULT 0,                     -- 単価
  tax_rate REAL DEFAULT 10,                      -- 税率
  amount REAL DEFAULT 0,                         -- 金額
  display_order INTEGER DEFAULT 0,               -- 表示順
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
);

-- =====================
-- 採番管理テーブル
-- =====================
CREATE TABLE IF NOT EXISTS number_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_type TEXT NOT NULL,                   -- 種別（estimate, delivery, invoice）
  prefix TEXT NOT NULL,                          -- プレフィックス（ES, DS, MS）
  year_month TEXT NOT NULL,                      -- 年月（YYMM形式）
  client_code TEXT,                              -- 取引先コード
  last_number INTEGER DEFAULT 0,                 -- 最終番号
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sequence_type, prefix, year_month, client_code)
);

-- =====================
-- インデックス作成
-- =====================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(client_name);
CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code);
CREATE INDEX IF NOT EXISTS idx_estimates_date ON estimates(estimate_date);
CREATE INDEX IF NOT EXISTS idx_estimates_client ON estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
