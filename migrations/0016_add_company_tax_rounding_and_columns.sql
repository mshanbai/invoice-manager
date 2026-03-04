ALTER TABLE company_info ADD COLUMN tax_rate_column_mode TEXT DEFAULT 'AUTO';
ALTER TABLE company_info ADD COLUMN tax_rounding_unit TEXT DEFAULT 'PER_LINE';
ALTER TABLE company_info ADD COLUMN tax_rounding_mode TEXT DEFAULT 'FLOOR';
ALTER TABLE company_info ADD COLUMN estimate_code_column_enabled INTEGER DEFAULT 0;
ALTER TABLE company_info ADD COLUMN estimate_code_column_kind TEXT DEFAULT 'JAN';
