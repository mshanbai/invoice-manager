-- 取引先マスタに追加フィールドを追加
-- TEL、FAX、担当者携帯、ウェブサイト

ALTER TABLE clients ADD COLUMN tel TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN fax TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN mobile TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN website TEXT DEFAULT '';
