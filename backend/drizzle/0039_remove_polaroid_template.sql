ALTER TABLE "article" DROP CONSTRAINT "article_template_valid";--> statement-breakpoint
-- The Polaroid design was removed (owner 2026-10-05): its stories show as Newspaper.
UPDATE "article" SET "template" = 'newspaper' WHERE "template" = 'polaroid';--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('classic', 'full-bleed', 'red-band', 'newspaper', 'split', 'slant', 'breaking', 'magazine', 'broadcast', 'bold-type', 'duotone', 'top-line', 'card', 'red-frame', 'ticker', 'quote'));