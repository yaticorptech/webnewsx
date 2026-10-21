CREATE TABLE "social_connection" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"token_enc" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_post" boolean DEFAULT true NOT NULL,
	"needs_reconnect_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_connection_user_id_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "social_connection_provider_valid" CHECK ("social_connection"."provider" in ('instagram', 'facebook'))
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"image_key" text,
	"remote_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "social_post_status_valid" CHECK ("social_post"."status" in ('waiting', 'pending', 'posted', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "social_connection" ADD CONSTRAINT "social_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_article_provider_unique" ON "social_post" USING btree ("article_id","provider");--> statement-breakpoint
CREATE INDEX "social_post_due_idx" ON "social_post" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "social_post_user_created_idx" ON "social_post" USING btree ("user_id","provider","created_at" DESC NULLS LAST);