CREATE TABLE "group_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"about" text NOT NULL,
	"image" text NOT NULL,
	"link" text,
	"proof" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"desk_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"group_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_application_status_valid" CHECK ("group_application"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" text,
	"invited_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp (3) with time zone,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "group_member_role_valid" CHECK ("group_member"."role" in ('owner', 'editor', 'writer')),
	CONSTRAINT "group_member_status_valid" CHECK ("group_member"."status" in ('invited', 'active')),
	CONSTRAINT "group_member_not_self" CHECK ("group_member"."group_id" <> "group_member"."user_id")
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "posted_by_id" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "group_submitted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "account_type" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_application" ADD CONSTRAINT "group_application_applicant_id_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_application" ADD CONSTRAINT "group_application_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_application" ADD CONSTRAINT "group_application_group_id_user_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_user_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_application_status_idx" ON "group_application" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "group_application_applicant_idx" ON "group_application" USING btree ("applicant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "group_member_user_idx" ON "group_member" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_posted_by_id_user_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;