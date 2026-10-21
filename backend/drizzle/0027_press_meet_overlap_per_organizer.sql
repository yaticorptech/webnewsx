-- Press meets may overlap across the site; only one organizer's own press meets can't (owner 2026-10-02).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "press_meet" DROP CONSTRAINT "press_meet_no_overlap";--> statement-breakpoint
ALTER TABLE "press_meet" ADD CONSTRAINT "press_meet_no_overlap" EXCLUDE USING gist ("organizer_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&) WHERE ("status" <> 'cancelled');
