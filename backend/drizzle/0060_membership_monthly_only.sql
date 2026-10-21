ALTER TABLE "membership_payment" DROP CONSTRAINT "membership_payment_plan_valid";--> statement-breakpoint
ALTER TABLE "membership_payment" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "membership_payment" DROP COLUMN "days";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "membership_price_quarterly";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "membership_price_yearly";