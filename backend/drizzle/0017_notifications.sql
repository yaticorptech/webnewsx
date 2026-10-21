CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"article_id" uuid,
	"article_title" text NOT NULL,
	"reason" text,
	"note" text,
	"reports" integer,
	"reasons" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "report_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" USING btree ("user_id") WHERE "notification"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_new_story_unique" ON "notification" USING btree ("user_id","article_id") WHERE "notification"."type" = 'new_story';