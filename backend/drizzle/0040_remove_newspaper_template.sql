ALTER TABLE "article" DROP CONSTRAINT "article_template_valid";--> statement-breakpoint
-- The Newspaper design was removed (owner 2026-10-05): its stories show as Red band.
UPDATE "article" SET "template" = 'red-band' WHERE "template" = 'newspaper';--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('classic', 'full-bleed', 'red-band', 'split', 'slant', 'breaking', 'magazine', 'broadcast', 'bold-type', 'duotone', 'top-line', 'card', 'red-frame', 'ticker', 'quote'));