-- 商品コードとJANコードのユニーク制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_product_code_unique
  ON products(user_id, product_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_jan_code_unique
  ON products(user_id, jan_code)
  WHERE jan_code IS NOT NULL AND jan_code <> '';
