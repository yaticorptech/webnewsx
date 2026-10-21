ALTER TABLE "contact_message" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "contact_message" ADD COLUMN "replied_by" text;--> statement-breakpoint
ALTER TABLE "contact_message" ADD CONSTRAINT "contact_message_replied_by_user_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;