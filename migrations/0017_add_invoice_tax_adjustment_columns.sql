ALTER TABLE invoices ADD COLUMN tax_adjustment REAL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN tax_adjustment_reason TEXT;
