CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text,
	"meta" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_flag_reason_valid" CHECK ("article_flag"."reason" in ('misinformation', 'hate', 'spam', 'copyright', 'other')),
	CONSTRAINT "article_flag_status_valid" CHECK ("article_flag"."status" in ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "article_read" (
	"article_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_read_article_id_viewer_key_pk" PRIMARY KEY("article_id","viewer_key")
);
--> statement-breakpoint
CREATE TABLE "article_save" (
	"user_id" text NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_save_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_share" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"article_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "press_pass" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pass_number" text NOT NULL,
	"beats" text[] DEFAULT '{}'::text[] NOT NULL,
	"state" text,
	"district" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"about" text,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"pledge_signed_at" timestamp with time zone,
	"pledge_signature" text,
	"level" text DEFAULT 'trainee' NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_pass_pass_number_unique" UNIQUE("pass_number"),
	CONSTRAINT "press_pass_level_valid" CHECK ("press_pass"."level" in ('trainee', 'verified')),
	CONSTRAINT "press_pass_number_format" CHECK ("press_pass"."pass_number" ~ '^WN-[A-Z]{2}-[0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "spotlight_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"package_id" uuid,
	"package_name" text NOT NULL,
	"hours" integer NOT NULL,
	"price_inr" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_ref" text,
	"starts_at" timestamp (3) with time zone,
	"ends_at" timestamp (3) with time zone,
	"granted_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotlight_order_status_valid" CHECK ("spotlight_order"."status" in ('pending', 'granted', 'declined', 'expired', 'cancelled')),
	CONSTRAINT "spotlight_order_provider_valid" CHECK ("spotlight_order"."provider" in ('manual', 'razorpay'))
);
--> statement-breakpoint
CREATE TABLE "spotlight_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hours" integer NOT NULL,
	"price_inr" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article" DROP CONSTRAINT "article_status_valid";--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "submitted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "pin_order" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'reader' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "reporter_level" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_flag" ADD CONSTRAINT "article_flag_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_flag" ADD CONSTRAINT "article_flag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_flag" ADD CONSTRAINT "article_flag_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_read" ADD CONSTRAINT "article_read_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_save" ADD CONSTRAINT "article_save_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_save" ADD CONSTRAINT "article_save_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_share" ADD CONSTRAINT "article_share_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_order" ADD CONSTRAINT "spotlight_order_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_order" ADD CONSTRAINT "spotlight_order_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_order" ADD CONSTRAINT "spotlight_order_package_id_spotlight_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."spotlight_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_order" ADD CONSTRAINT "spotlight_order_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_flag_open_unique" ON "article_flag" USING btree ("article_id","user_id") WHERE "article_flag"."status" = 'open';--> statement-breakpoint
CREATE INDEX "article_flag_article_idx" ON "article_flag" USING btree ("article_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_flag_status_created_idx" ON "article_flag" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_read_created_idx" ON "article_read" USING btree ("created_at","article_id");--> statement-breakpoint
CREATE INDEX "article_save_user_created_idx" ON "article_save" USING btree ("user_id","created_at" DESC NULLS LAST,"article_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_share_article_created_idx" ON "article_share" USING btree ("article_id","created_at");--> statement-breakpoint
CREATE INDEX "article_share_created_idx" ON "article_share" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "press_pass_issued_idx" ON "press_pass" USING btree ("issued_at" DESC NULLS LAST,"user_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spotlight_order_article_idx" ON "spotlight_order" USING btree ("article_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spotlight_order_status_idx" ON "spotlight_order" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "spotlight_order_reporter_idx" ON "spotlight_order" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spotlight_order_created_idx" ON "spotlight_order" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_review_idx" ON "article" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "article_pinned_idx" ON "article" USING btree ("pin_order") WHERE "article"."pinned_at" is not null;--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_in_review_complete" CHECK ("article"."status" <> 'in_review' or ("article"."title" is not null and "article"."body_html" is not null and "article"."cover_url" is not null and "article"."submitted_at" is not null));--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_status_valid" CHECK ("article"."status" in ('draft', 'in_review', 'published'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_valid" CHECK ("user"."role" in ('reader', 'reporter', 'admin'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_reporter_level_valid" CHECK ("user"."reporter_level" is null or "user"."reporter_level" in ('trainee', 'verified'));--> statement-breakpoint
-- Data (SPEC §3.11): onboarded accounts that already published → Verified Reporters with a Press Pass
-- (region "IN", beats empty → the Newsroom asks them to complete it). Everyone else stays a Reader.
DO $$
DECLARE
	r record;
	n text;
BEGIN
	FOR r IN
		SELECT u.id, u.created_at,
			(SELECT count(*)::int FROM "article" a WHERE a."author_id" = u.id AND a."status" = 'published') AS published
		FROM "user" u
		WHERE u."onboarded_at" IS NOT NULL
			AND EXISTS (SELECT 1 FROM "article" a WHERE a."author_id" = u.id AND a."status" = 'published')
			AND NOT EXISTS (SELECT 1 FROM "press_pass" p WHERE p."user_id" = u.id)
	LOOP
		LOOP
			n := 'WN-IN-' || (100000 + floor(random() * 900000))::int::text;
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "press_pass" WHERE "pass_number" = n);
		END LOOP;
		INSERT INTO "press_pass" ("user_id", "pass_number", "state", "level", "approved_count", "issued_at")
		VALUES (r.id, n, NULL, 'verified', r.published, now());
		UPDATE "user" SET "role" = 'reporter', "reporter_level" = 'verified' WHERE "id" = r.id AND "role" = 'reader';
		UPDATE "user" SET "reporter_level" = 'verified' WHERE "id" = r.id AND "role" = 'admin';
	END LOOP;
END $$;
--> statement-breakpoint
-- Default Spotlight packages (admin-editable): 6h ₹99 · 24h ₹249 · 72h ₹599.
INSERT INTO "spotlight_package" ("name", "hours", "price_inr", "active", "sort")
SELECT v.name, v.hours, v.price, true, v.sort
FROM (VALUES ('Flash', 6, 99, 1), ('Front Page Day', 24, 249, 2), ('Weekend Lead', 72, 599, 3)) AS v(name, hours, price, sort)
WHERE NOT EXISTS (SELECT 1 FROM "spotlight_package");
