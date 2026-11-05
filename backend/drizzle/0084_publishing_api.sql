-- Publishing API (owner 2026-11-04): reporters make keys in Settings; their own website posts stories with them.
CREATE TABLE IF NOT EXISTS "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL UNIQUE,
	"last_used_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_user_idx" ON "api_key" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_post" (
	"article_id" uuid PRIMARY KEY NOT NULL REFERENCES "article"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"key_id" uuid REFERENCES "api_key"("id") ON DELETE set null,
	"external_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_post_external_idx" ON "api_post" ("user_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_post_user_idx" ON "api_post" ("user_id","created_at");
