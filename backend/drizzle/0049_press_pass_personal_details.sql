ALTER TABLE "press_pass" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "id_type" text;--> statement-breakpoint
ALTER TABLE "press_pass" ADD COLUMN "id_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "press_pass_id_unique" ON "press_pass" USING btree ("id_type","id_number");--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_id_type_valid" CHECK ("press_pass"."id_type" in ('pan', 'voter_id', 'driving_licence', 'passport'));--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_pincode_format" CHECK ("press_pass"."pincode" ~ '^[1-9][0-9]{5}$');