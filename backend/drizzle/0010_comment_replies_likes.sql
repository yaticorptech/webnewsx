CREATE TABLE "article_comment_like" (
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_comment_like_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "article_comment" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "article_comment" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_comment_like" ADD CONSTRAINT "article_comment_like_comment_id_article_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."article_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comment_like" ADD CONSTRAINT "article_comment_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_parent_id_article_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_comment_parent_created_idx" ON "article_comment" USING btree ("parent_id","created_at","id");