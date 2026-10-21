CREATE TABLE "user_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"viewer_key" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"label" text,
	"article_id" uuid,
	"target_username" text,
	"path" text NOT NULL,
	"platform" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_event_created_idx" ON "user_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_event_user_idx" ON "user_event" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_event_viewer_idx" ON "user_event" USING btree ("viewer_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_event_article_idx" ON "user_event" USING btree ("article_id","created_at");--> statement-breakpoint
CREATE INDEX "user_event_name_idx" ON "user_event" USING btree ("name","created_at");