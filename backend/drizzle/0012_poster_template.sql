ALTER TABLE "article" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('classic', 'full-bleed', 'red-band', 'newspaper', 'split', 'slant'));--> statement-breakpoint
-- Stories that were live (or waiting at the Review Desk) before poster templates existed get the Classic poster
-- (owner 2026-09-26). Drafts stay without one: the composer asks for a template when they are published.
UPDATE "article" SET "template" = 'classic' WHERE "template" IS NULL AND "status" IN ('published', 'in_review');
