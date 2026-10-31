CREATE TABLE "content_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"username" text,
	"actor_id" text,
	"actor_username" text,
	"action" text NOT NULL,
	"article_id" uuid,
	"article_title" text,
	"article_slug" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_event" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "user_event" ADD COLUMN "user_agent" text;--> statement-breakpoint
CREATE INDEX "content_log_created_idx" ON "content_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_log_user_idx" ON "content_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_log_article_idx" ON "content_log" USING btree ("article_id","created_at" DESC NULLS LAST);