-- Add location column to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS location TEXT;
