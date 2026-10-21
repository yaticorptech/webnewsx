CREATE TABLE "membership_payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"reference" text,
	"note" text,
	"paid_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "membership_payout_amount_positive" CHECK ("membership_payout"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "membership_payout" ADD CONSTRAINT "membership_payout_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payout" ADD CONSTRAINT "membership_payout_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_payout_reporter_idx" ON "membership_payout" USING btree ("reporter_id","paid_at");