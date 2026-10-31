DROP INDEX "wish_comment_once";--> statement-breakpoint
CREATE UNIQUE INDEX "wish_comment_one_per_user" ON "wish_comment" USING btree ("wish_id","user_id");