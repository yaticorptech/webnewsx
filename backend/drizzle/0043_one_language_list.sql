-- Custom SQL migration file, put your code below! ---- One list of languages per account (owner 2026-10-05): what they read = a reporter's Press Pass languages.
-- Up to 6, like a Press Pass.
UPDATE "user" SET "preferred_languages" = "preferred_languages"[1:6] WHERE cardinality("preferred_languages") > 6;--> statement-breakpoint
-- Picked in Settings since sign-up asked: that's their latest choice, so the pass follows it.
UPDATE "press_pass" p SET "languages" = u."preferred_languages", "updated_at" = now()
FROM "user" u
WHERE u."id" = p."user_id" AND cardinality(u."preferred_languages") > 0 AND p."languages" IS DISTINCT FROM u."preferred_languages";--> statement-breakpoint
-- Never picked: they read what they report in.
UPDATE "user" u SET "preferred_languages" = array_remove(p."languages", 'other')
FROM "press_pass" p
WHERE u."id" = p."user_id" AND cardinality(u."preferred_languages") = 0;
