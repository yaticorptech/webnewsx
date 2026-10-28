ALTER TABLE "press_pass" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "domain_token" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "domain_verified_at" timestamp with time zone;