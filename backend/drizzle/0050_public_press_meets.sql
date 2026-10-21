ALTER TABLE "press_meet" ADD COLUMN "visibility" text DEFAULT 'invited' NOT NULL;--> statement-breakpoint
CREATE INDEX "press_meet_public_idx" ON "press_meet" USING btree ("starts_at") WHERE "press_meet"."visibility" = 'public';--> statement-breakpoint
ALTER TABLE "press_meet" ADD CONSTRAINT "press_meet_visibility_valid" CHECK ("press_meet"."visibility" in ('invited', 'public'));