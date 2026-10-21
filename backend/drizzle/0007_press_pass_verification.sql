ALTER TABLE "press_pass" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "reporter_type" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "outlet" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_mobile_unique" UNIQUE("mobile");--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_reporter_type_valid" CHECK ("press_pass"."reporter_type" in ('citizen', 'freelance', 'staff'));--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_experience_valid" CHECK ("press_pass"."experience" in ('new', '1_2', '3_5', '6_10', '10_plus'));