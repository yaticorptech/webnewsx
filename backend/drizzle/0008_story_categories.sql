ALTER TABLE "article" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "district" text;--> statement-breakpoint
CREATE INDEX "article_category_feed_idx" ON "article" USING btree ("category","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "article"."status" = 'published';--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_category_valid" CHECK (category in ('national', 'world', 'sports', 'entertainment', 'technology', 'karnataka', 'astrology', 'business', 'crime', 'education', 'cinema', 'others', 'politics', 'press-releases', 'jobs'));--> statement-breakpoint
-- Stories that were live (or waiting at the Review Desk) before categories existed go to "Others" (owner 2026-09-26).
-- Drafts stay uncategorised: the composer asks for a category when they are published.
UPDATE "article" SET "category" = 'others' WHERE "category" IS NULL AND "status" IN ('published', 'in_review');
