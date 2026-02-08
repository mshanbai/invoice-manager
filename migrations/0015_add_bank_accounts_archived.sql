ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

UPDATE bank_accounts
SET is_archived = false
WHERE is_archived IS NULL;
