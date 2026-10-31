ALTER TABLE "article_comment" DROP CONSTRAINT "article_comment_body_length";--> statement-breakpoint
ALTER TABLE "article_comment" ADD COLUMN "gif" jsonb;--> statement-breakpoint
ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_body_length" CHECK (char_length("article_comment"."body") <= 1000 and (char_length("article_comment"."body") >= 1 or "article_comment"."gif" is not null));