CREATE TABLE "user_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"article_id" uuid,
	"article_title" text,
	"message" text,
	"created_by" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "user_notice_kind_valid" CHECK ("user_notice"."kind" in ('warning', 'story_hidden'))
);
--> statement-breakpoint
ALTER TABLE "user_notice" ADD CONSTRAINT "user_notice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notice" ADD CONSTRAINT "user_notice_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notice" ADD CONSTRAINT "user_notice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notice_user_created_idx" ON "user_notice" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_notice_unread_idx" ON "user_notice" USING btree ("user_id") WHERE "user_notice"."read_at" is null;--> statement-breakpoint
-- Backfill: warnings given before notices existed (admin audit log) reach their reporters now.
INSERT INTO "user_notice" ("user_id", "kind", "article_id", "article_title", "message", "created_by", "created_at")
SELECT l."target_id", 'warning', a."id", a."title", NULLIF(l."meta"->>'note', ''), l."actor_id", l."created_at"
FROM "admin_audit_log" l
JOIN "user" u ON u."id" = l."target_id"
LEFT JOIN "article" a ON a."id"::text = l."meta"->>'articleId'
WHERE l."action" = 'user.warn';
--> statement-breakpoint
-- …and so do stories that are hidden right now.
INSERT INTO "user_notice" ("user_id", "kind", "article_id", "article_title", "message", "created_at")
SELECT a."author_id", 'story_hidden', a."id", a."title", a."hidden_reason", a."hidden_at"
FROM "article" a
WHERE a."hidden_at" IS NOT NULL;
