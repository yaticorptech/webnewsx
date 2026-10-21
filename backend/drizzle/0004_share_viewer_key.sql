ALTER TABLE "article_share" ADD COLUMN "viewer_key" text;--> statement-breakpoint
CREATE INDEX "article_share_viewer_idx" ON "article_share" USING btree ("article_id","viewer_key","created_at");