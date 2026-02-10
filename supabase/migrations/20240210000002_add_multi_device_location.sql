-- Drop the existing check constraint on device
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_device_check;

-- Alter device column to be an array of text
-- We use a temporary column to convert existing data if necessary, 
-- but since we can just cast, let's try direct casting.
-- If 'desktop' is the value, it becomes '{desktop}'
ALTER TABLE tasks ALTER COLUMN device TYPE text[] USING ARRAY[device];

-- Add location column to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'us-east';

-- Add device column to reports (to track which device was used for this specific report)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS device TEXT;
