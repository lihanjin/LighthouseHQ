-- Add 'cancelled' to the allowed status values for tasks table
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
