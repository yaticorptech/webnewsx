-- Instagram post format per connection (owner 2026-11-12): webnews.in posts every story to the feed, reporters keep Stories.
ALTER TABLE "social_connection" ADD COLUMN IF NOT EXISTS "post_format" text DEFAULT 'story' NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_connection" DROP CONSTRAINT IF EXISTS "social_connection_post_format_valid";
--> statement-breakpoint
ALTER TABLE "social_connection" ADD CONSTRAINT "social_connection_post_format_valid" CHECK ("post_format" in ('story', 'feed'));
