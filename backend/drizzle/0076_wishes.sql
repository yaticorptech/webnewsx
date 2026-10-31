CREATE TABLE "wish" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"template" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"photo_url" text,
	"photo_key" text,
	"event_at" timestamp (3) with time zone,
	"venue" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wish_expires_idx" ON "wish" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "wish_author_idx" ON "wish" USING btree ("author_id","created_at" DESC NULLS LAST);