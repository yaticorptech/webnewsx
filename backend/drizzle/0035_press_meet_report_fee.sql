CREATE TABLE "press_meet_fee_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"press_meet_id" uuid,
	"amount_inr" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"paid_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_meet_fee_payment_provider_valid" CHECK ("press_meet_fee_payment"."provider" in ('test', 'razorpay')),
	CONSTRAINT "press_meet_fee_payment_amount_valid" CHECK ("press_meet_fee_payment"."amount_inr" >= 0)
);
--> statement-breakpoint
CREATE TABLE "press_meet_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"press_meet_id" uuid,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "press_meet_fee_payment" ADD CONSTRAINT "press_meet_fee_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_fee_payment" ADD CONSTRAINT "press_meet_fee_payment_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_report" ADD CONSTRAINT "press_meet_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_report" ADD CONSTRAINT "press_meet_report_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_setting" ADD CONSTRAINT "site_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "press_meet_fee_payment_user_idx" ON "press_meet_fee_payment" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "press_meet_fee_payment_meet_unique" ON "press_meet_fee_payment" USING btree ("press_meet_id");--> statement-breakpoint
CREATE INDEX "press_meet_report_user_idx" ON "press_meet_report" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "press_meet_report_meet_unique" ON "press_meet_report" USING btree ("press_meet_id");--> statement-breakpoint
-- Owner 2026-10-05: a starting platform fee for booking a press meet; the Editor Desk changes it (Desk → Press meets).
INSERT INTO "site_setting" ("key", "value") VALUES ('press_meet.platform_fee', '{"amountInr": 499}'::jsonb) ON CONFLICT ("key") DO NOTHING;
