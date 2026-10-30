CREATE TABLE "publisher_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"domain" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"logo_url" text,
	"logo_key" text,
	"city" text,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"admin_email" text NOT NULL,
	"admin_password_hash" text NOT NULL,
	"admin_token_version" integer DEFAULT 0 NOT NULL,
	"hidden_article_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"breaking_article_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_site_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "publisher_site_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "site_ad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"position" text NOT NULL,
	"title" text NOT NULL,
	"creative_url" text,
	"creative_key" text,
	"video" boolean DEFAULT false NOT NULL,
	"target_url" text,
	"starts_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publisher_site" ADD CONSTRAINT "publisher_site_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_site" ADD CONSTRAINT "publisher_site_source_id_user_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_ad" ADD CONSTRAINT "site_ad_site_id_publisher_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."publisher_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publisher_site_source_idx" ON "publisher_site" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "site_ad_site_idx" ON "site_ad" USING btree ("site_id","position");