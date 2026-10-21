ALTER TABLE "user_event" DROP CONSTRAINT "user_event_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;