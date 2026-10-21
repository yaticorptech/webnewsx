CREATE TABLE "press_meet_note" (
	"press_meet_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_meet_note_press_meet_id_user_id_pk" PRIMARY KEY("press_meet_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "press_meet_note" ADD CONSTRAINT "press_meet_note_press_meet_id_press_meet_id_fk" FOREIGN KEY ("press_meet_id") REFERENCES "public"."press_meet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_meet_note" ADD CONSTRAINT "press_meet_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;