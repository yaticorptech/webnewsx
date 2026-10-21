CREATE TABLE "article_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_comment_body_length" CHECK (char_length("article_comment"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_comment_article_created_idx" ON "article_comment" USING btree ("article_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);