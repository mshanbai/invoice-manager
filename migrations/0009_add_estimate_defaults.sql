-- 見積書デフォルト設定を追加
ALTER TABLE company_info ADD COLUMN default_delivery_place TEXT DEFAULT '';
ALTER TABLE company_info ADD COLUMN default_payment_terms TEXT DEFAULT '';
ALTER TABLE company_info ADD COLUMN default_delivery_date TEXT DEFAULT '';

-- 見積書テーブルに受渡場所・取引条件・納期・有効期限テキストを追加
ALTER TABLE estimates ADD COLUMN delivery_place TEXT DEFAULT '';
ALTER TABLE estimates ADD COLUMN payment_terms TEXT DEFAULT '';
ALTER TABLE estimates ADD COLUMN delivery_date_text TEXT DEFAULT '';
ALTER TABLE estimates ADD COLUMN valid_until_text TEXT DEFAULT '';

-- 見積明細に備考を追加
ALTER TABLE estimate_items ADD COLUMN item_notes TEXT DEFAULT '';
