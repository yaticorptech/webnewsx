-- Scheduled publishing (owner 2026-11-06: "schedule it and auto upload"): a draft with a publish time goes live on
-- its own at that time (lib/scheduled-publish-worker.ts), with the usual follower bell + phone push; a scheduled
-- birthday wish / invitation stays out of the feed until then.
ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp (3) with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_scheduled_idx" ON "article" ("scheduled_at") WHERE "scheduled_at" IS NOT NULL AND "status" = 'draft';
--> statement-breakpoint
ALTER TABLE "wish" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp (3) with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wish_scheduled_idx" ON "wish" ("scheduled_at") WHERE "scheduled_at" IS NOT NULL;
