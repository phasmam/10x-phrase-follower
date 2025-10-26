-- Fix encrypted_key column to use text instead of bytea
-- This prevents Supabase from converting the data to hex format

-- First, add a new text column
ALTER TABLE tts_credentials ADD COLUMN encrypted_key_text text;

-- Copy existing data (if any) from bytea to text
-- This will convert hex format back to base64
UPDATE tts_credentials 
SET encrypted_key_text = encode(encrypted_key, 'base64')
WHERE encrypted_key IS NOT NULL;

-- Drop the old bytea column
ALTER TABLE tts_credentials DROP COLUMN encrypted_key;

-- Rename the new column to the original name
ALTER TABLE tts_credentials RENAME COLUMN encrypted_key_text TO encrypted_key;

-- Add NOT NULL constraint
ALTER TABLE tts_credentials ALTER COLUMN encrypted_key SET NOT NULL;

-- Add comment
COMMENT ON COLUMN tts_credentials.encrypted_key IS 'Application-encrypted API key stored as base64 text';
