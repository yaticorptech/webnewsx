CREATE TABLE "push_device" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
-- Notifications from before push existed are never sent to phones.
UPDATE "notification" SET "pushed_at" = "created_at";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_device_user_idx" ON "push_device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_push_queue_idx" ON "notification" USING btree ("created_at") WHERE "notification"."pushed_at" is null;