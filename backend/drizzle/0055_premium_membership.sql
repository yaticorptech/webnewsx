CREATE TABLE "membership_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"price_inr" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"fee_paise" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"period_start" timestamp (3) with time zone,
	"period_end" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp (3) with time zone,
	CONSTRAINT "membership_payment_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "membership_payment_provider_valid" CHECK ("membership_payment"."provider" in ('test', 'razorpay')),
	CONSTRAINT "membership_payment_status_valid" CHECK ("membership_payment"."status" in ('created', 'paid')),
	CONSTRAINT "membership_payment_amounts_valid" CHECK ("membership_payment"."amount_paise" > 0 and "membership_payment"."fee_paise" >= 0 and "membership_payment"."fee_paise" <= "membership_payment"."amount_paise"),
	CONSTRAINT "membership_payment_paid_complete" CHECK ("membership_payment"."status" <> 'paid' or ("membership_payment"."paid_at" is not null and "membership_payment"."period_end" is not null))
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "premium" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "membership_price" integer;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD CONSTRAINT "membership_payment_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD CONSTRAINT "membership_payment_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_payment_member_idx" ON "membership_payment" USING btree ("member_id","reporter_id","period_end");--> statement-breakpoint
CREATE INDEX "membership_payment_reporter_idx" ON "membership_payment" USING btree ("reporter_id","paid_at");