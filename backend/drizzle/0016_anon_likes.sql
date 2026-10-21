CREATE TABLE "article_anon_like" (
	"viewer_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_anon_like_viewer_id_article_id_pk" PRIMARY KEY("viewer_id","article_id")
);
--> statement-breakpoint
ALTER TABLE "article_anon_like" ADD CONSTRAINT "article_anon_like_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_anon_like_article_idx" ON "article_anon_like" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_anon_like_created_idx" ON "article_anon_like" USING btree ("created_at");