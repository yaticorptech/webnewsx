CREATE TABLE "press_meet_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"press_meet_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "press_meet" ADD COLUMN "chat_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "press_meet_message" ADD CONSTRAINT "press_meet_message_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_message" ADD CONSTRAINT "press_meet_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "press_meet_message_meet_idx" ON "press_meet_message" USING btree ("press_meet_id","created_at");