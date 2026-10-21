ALTER TABLE "press_pass" DROP CONSTRAINT "press_pass_id_type_valid";--> statement-breakpoint
DROP INDEX "press_pass_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "press_pass_id_unique" ON "press_pass" USING btree ("id_type","id_number") WHERE "press_pass"."id_type" <> 'aadhaar';--> statement-breakpoint
ALTER TABLE "press_pass" ADD CONSTRAINT "press_pass_id_type_valid" CHECK ("press_pass"."id_type" in ('pan', 'voter_id', 'driving_licence', 'passport', 'aadhaar'));