-- The seeded demo accounts (@demo.webnews.local, created by Claude's seed scripts) count as "Added by Claude" in the
-- Editor Desk's Readers / Reporters filters (owner 2026-11-04). The demo Desk login (admin.demo) is left out.
UPDATE "user" SET "added_by" = 'claude'
WHERE "added_by" IS NULL AND "email" LIKE '%@demo.webnews.local' AND "username" IS DISTINCT FROM 'admin.demo';
