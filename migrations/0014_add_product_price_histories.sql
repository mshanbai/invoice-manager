-- 商品単価変更履歴（適用日ベース）
CREATE TABLE IF NOT EXISTS product_price_histories (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  cost_price REAL NOT NULL,
  wholesale_price REAL NOT NULL,
  list_price REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(product_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_product_price_histories_product
  ON product_price_histories(product_id);
