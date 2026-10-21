ALTER TABLE "membership_payment" ADD COLUMN "plan" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD COLUMN "days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD COLUMN "ending_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD COLUMN "ended_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "membership_price_quarterly" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "membership_price_yearly" integer;--> statement-breakpoint
ALTER TABLE "membership_payment" ADD CONSTRAINT "membership_payment_plan_valid" CHECK ("membership_payment"."plan" in ('monthly', 'quarterly', 'yearly'));