ALTER TABLE reports 
ADD COLUMN IF NOT EXISTS fcp numeric,
ADD COLUMN IF NOT EXISTS lcp numeric,
ADD COLUMN IF NOT EXISTS tbt numeric,
ADD COLUMN IF NOT EXISTS cls numeric,
ADD COLUMN IF NOT EXISTS speed_index numeric,
ADD COLUMN IF NOT EXISTS total_byte_weight numeric;
