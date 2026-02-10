-- Change urls column from text[] to jsonb to support storing titles
ALTER TABLE projects ALTER COLUMN urls DROP DEFAULT;

ALTER TABLE projects
ALTER COLUMN urls TYPE jsonb
USING to_jsonb(urls);

ALTER TABLE projects ALTER COLUMN urls SET DEFAULT '[]'::jsonb;
