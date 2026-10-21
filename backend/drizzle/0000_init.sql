CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"body_html" text,
	"body_text" text,
	"excerpt" text,
	"cover_url" text,
	"cover_key" text,
	"cover_width" integer,
	"cover_height" integer,
	"cover_blur" text,
	"link_url" text,
	"link_domain" text,
	"slug" text,
	"reading_minutes" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp (3) with time zone,
	CONSTRAINT "article_slug_unique" UNIQUE("slug"),
	CONSTRAINT "article_status_valid" CHECK ("article"."status" in ('draft', 'published')),
	CONSTRAINT "article_published_complete" CHECK ("article"."status" <> 'published' or ("article"."title" is not null and "article"."body_html" is not null and "article"."cover_url" is not null and "article"."slug" is not null and "article"."published_at" is not null)),
	CONSTRAINT "article_excerpt_length" CHECK (char_length("article"."excerpt") <= 280),
	CONSTRAINT "article_counts_non_negative" CHECK ("article"."view_count" >= 0 and "article"."like_count" >= 0 and "article"."share_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "article_like" (
	"user_id" text NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_like_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_view" (
	"article_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_view_article_id_viewer_key_pk" PRIMARY KEY("article_id","viewer_key")
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "follow_not_self" CHECK ("follow"."follower_id" <> "follow"."following_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"username" text,
	"bio" text,
	"onboarded_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_username_format" CHECK ("user"."username" ~ '^(?=.{3,30}$)(?!\.)(?!.*\.\.)(?!.*\.$)[a-z.]+$'),
	CONSTRAINT "user_bio_length" CHECK (char_length("user"."bio") <= 160)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_like" ADD CONSTRAINT "article_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_like" ADD CONSTRAINT "article_like_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_view" ADD CONSTRAINT "article_view_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_following_id_user_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "article_feed_idx" ON "article" USING btree ("status","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_author_status_published_idx" ON "article" USING btree ("author_id","status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_author_updated_idx" ON "article" USING btree ("author_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_like_article_idx" ON "article_like" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "follow_following_idx" ON "follow" USING btree ("following_id","created_at" DESC NULLS LAST,"follower_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "follow_follower_created_idx" ON "follow" USING btree ("follower_id","created_at" DESC NULLS LAST,"following_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");