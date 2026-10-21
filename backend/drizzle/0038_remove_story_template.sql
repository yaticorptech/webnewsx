ALTER TABLE "article" DROP CONSTRAINT "article_template_valid";--> statement-breakpoint
-- The Story design was removed (owner 2026-10-05): its stories show as Floating card.
UPDATE "article" SET "template" = 'card' WHERE "template" = 'story';--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('classic', 'full-bleed', 'red-band', 'newspaper', 'split', 'slant', 'breaking', 'magazine', 'broadcast', 'bold-type', 'duotone', 'polaroid', 'top-line', 'card', 'red-frame', 'ticker', 'quote'));