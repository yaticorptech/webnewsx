-- Farm prices history (owner 2026-11-05: "where is Mangaluru?"): every AGMARKNET report the Market page fetched, so a
-- market that didn't report today still shows its latest price (with its date) for a week.
CREATE TABLE IF NOT EXISTS "mandi_price" (
	"date" date NOT NULL,
	"market" text NOT NULL,
	"commodity" text NOT NULL,
	"variety" text NOT NULL DEFAULT '',
	"district" text NOT NULL DEFAULT '',
	"min_price" integer NOT NULL,
	"max_price" integer NOT NULL,
	"modal_price" integer NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("date", "market", "commodity", "variety")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mandi_price_date_idx" ON "mandi_price" ("date");
