-- Deleting a story removes its Instagram / Facebook posts too (owner 2026-11-14): the posted rows outlive the story
-- (article_id set null, its title kept) until the worker has deleted them on Meta (removed_at) or Meta refused (remove_error).
ALTER TABLE "social_post" ALTER COLUMN "article_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_post" DROP CONSTRAINT IF EXISTS "social_post_article_id_article_id_fk";
--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN IF NOT EXISTS "story_title" text;
--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN IF NOT EXISTS "permalink" text;
--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN IF NOT EXISTS "remove_error" text;
