-- The dummy test readers on the live site (@test.webnewsx.invalid / .local, created by Claude) count as "Added by
-- Claude" too, so "All readers" lists real people only (owner 2026-11-04).
UPDATE "user" SET "added_by" = 'claude'
WHERE "added_by" IS NULL AND ("email" LIKE '%@test.webnewsx.invalid' OR "email" LIKE '%@test.webnewsx.local');
