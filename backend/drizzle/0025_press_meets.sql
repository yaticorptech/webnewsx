CREATE TABLE "press_meet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" text NOT NULL,
	"title" text NOT NULL,
	"agenda" text,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"platform" text DEFAULT 'webnews' NOT NULL,
	"meet_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"reminded_day_at" timestamp with time zone,
	"reminded_soon_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_meet_status_valid" CHECK ("press_meet"."status" in ('scheduled', 'live', 'ended', 'cancelled')),
	CONSTRAINT "press_meet_platform_valid" CHECK ("press_meet"."platform" in ('webnews', 'google_meet')),
	CONSTRAINT "press_meet_duration_valid" CHECK ("press_meet"."duration_minutes" in (30, 60, 90)),
	CONSTRAINT "press_meet_time_order" CHECK ("press_meet"."ends_at" > "press_meet"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "press_meet_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"press_meet_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"price" integer NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"responded_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"article_id" uuid,
	"article_title" text,
	"submitted_at" timestamp with time zone,
	"review" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"payment" text DEFAULT 'unpaid' NOT NULL,
	"payment_ref" text,
	"released_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_meet_invite_status_valid" CHECK ("press_meet_invite"."status" in ('invited', 'accepted', 'declined')),
	CONSTRAINT "press_meet_invite_review_valid" CHECK ("press_meet_invite"."review" is null or "press_meet_invite"."review" in ('pending', 'approved', 'changes')),
	CONSTRAINT "press_meet_invite_payment_valid" CHECK ("press_meet_invite"."payment" in ('unpaid', 'released', 'received')),
	CONSTRAINT "press_meet_invite_price_valid" CHECK ("press_meet_invite"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "press_meet_peer" (
	"peer_id" text PRIMARY KEY NOT NULL,
	"press_meet_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"mic_on" boolean DEFAULT false NOT NULL,
	"camera_on" boolean DEFAULT false NOT NULL,
	"hand" boolean DEFAULT false NOT NULL,
	"recording" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "press_meet_recording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"press_meet_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"status" text DEFAULT 'recording' NOT NULL,
	"source_type" text NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"last_chunk_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "press_meet_recording_status_valid" CHECK ("press_meet_recording"."status" in ('recording', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "press_meet_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "press_meet_id" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "press_meet" ADD CONSTRAINT "press_meet_organizer_id_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_invite" ADD CONSTRAINT "press_meet_invite_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_invite" ADD CONSTRAINT "press_meet_invite_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_invite" ADD CONSTRAINT "press_meet_invite_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_peer" ADD CONSTRAINT "press_meet_peer_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_peer" ADD CONSTRAINT "press_meet_peer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_recording" ADD CONSTRAINT "press_meet_recording_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_recording" ADD CONSTRAINT "press_meet_recording_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "press_meet_organizer_idx" ON "press_meet" USING btree ("organizer_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "press_meet_starts_idx" ON "press_meet" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "press_meet_invite_unique" ON "press_meet_invite" USING btree ("press_meet_id","reporter_id");--> statement-breakpoint
CREATE INDEX "press_meet_invite_reporter_idx" ON "press_meet_invite" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "press_meet_peer_meet_idx" ON "press_meet_peer" USING btree ("press_meet_id");--> statement-breakpoint
CREATE INDEX "press_meet_recording_reporter_idx" ON "press_meet_recording" USING btree ("press_meet_id","reporter_id");--> statement-breakpoint
CREATE INDEX "press_meet_recording_status_idx" ON "press_meet_recording" USING btree ("status");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One press meet at a time across the whole site (owner 2026-10-01): two bookings can't overlap.
ALTER TABLE "press_meet" ADD CONSTRAINT "press_meet_no_overlap" EXCLUDE USING gist (tstzrange("starts_at", "ends_at") WITH &&) WHERE ("status" <> 'cancelled');
