CREATE TABLE "spotlight_impression" (
	"order_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"shows" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotlight_impression_order_id_viewer_key_pk" PRIMARY KEY("order_id","viewer_key")
);
--> statement-breakpoint
ALTER TABLE "spotlight_impression" ADD CONSTRAINT "spotlight_impression_order_id_spotlight_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."spotlight_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotlight_impression_viewer_idx" ON "spotlight_impression" USING btree ("viewer_key");