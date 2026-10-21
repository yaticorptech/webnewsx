ALTER TABLE "press_meet_invite" ADD COLUMN "recording_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "press_meet_peer" ADD COLUMN "can_speak" boolean DEFAULT false NOT NULL;