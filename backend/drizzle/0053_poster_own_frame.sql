ALTER TABLE "article" DROP CONSTRAINT "article_template_valid";--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "poster_overlay_url" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "poster_overlay_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "poster_overlay_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "poster_overlay_key" text;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_template_valid" CHECK (template in ('plain', 'classic', 'full-bleed', 'red-band', 'split', 'slant', 'breaking', 'magazine', 'broadcast', 'bold-type', 'top-line', 'card', 'red-frame', 'ticker', 'quote', 'highlight', 'glass', 'red-fade', 'own-frame'));