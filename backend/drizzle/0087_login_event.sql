-- Sign-in log (owner 2026-11-11: "collect ip … when login also"): one row per sign-in with the IP address and device it
-- came from. Kept apart from `session` because a session row is deleted on sign-out; this log stays (Desk → Visitors).
CREATE TABLE IF NOT EXISTS "login_event" (
  "id" bigserial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "method" text,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_event_created_idx" ON "login_event" ("created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_event_user_idx" ON "login_event" ("user_id", "created_at" DESC);
--> statement-breakpoint
-- Sign-ins from before this log: the sessions still open.
INSERT INTO "login_event" ("user_id", "ip", "user_agent", "created_at")
SELECT "user_id", "ip_address", "user_agent", "created_at" FROM "session"
WHERE NOT EXISTS (SELECT 1 FROM "login_event");
