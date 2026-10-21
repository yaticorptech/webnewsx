CREATE TABLE "article_dislike" (
	"article_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_dislike_article_id_viewer_key_pk" PRIMARY KEY("article_id","viewer_key")
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "dislike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_dislike" ADD CONSTRAINT "article_dislike_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;