ALTER TABLE "article" DROP CONSTRAINT "article_template_valid";--> statement-breakpoint
-- The Duotone design was removed (owner 2026-10-07): its stories show as Full bleed.
UPDATE "article" SET "template" = 'full-bleed' WHERE "template" = 'duotone';--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('classic', 'full-bleed', 'red-band', 'split', 'slant', 'breaking', 'magazine', 'broadcast', 'bold-type', 'top-line', 'card', 'red-frame', 'ticker', 'quote'));