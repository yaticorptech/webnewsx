CREATE TABLE "wish_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wish_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wish_comment" ADD CONSTRAINT "wish_comment_wish_id_wish_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wish"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_comment" ADD CONSTRAINT "wish_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wish_comment_wish_idx" ON "wish_comment" USING btree ("wish_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wish_comment_once" ON "wish_comment" USING btree ("wish_id","user_id","body");