ALTER TABLE "publisher_site" ADD COLUMN "nav_categories" text[];--> statement-breakpoint
ALTER TABLE "publisher_site" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;