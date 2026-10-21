ALTER TABLE "article" ADD COLUMN "short_code" text;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_short_code_unique" UNIQUE("short_code");--> statement-breakpoint
-- Data: every live story (and every story waiting at the Review Desk) gets its share-link code now; new ones get
-- one when they first go live (lib/slug.ts makeShortCode). 7 chars of a–z 0–9, drawn again whenever taken.
DO $$
DECLARE
	r record;
BEGIN
	FOR r IN SELECT "id" FROM "article" WHERE "status" IN ('published', 'in_review') AND "short_code" IS NULL LOOP
		LOOP
			BEGIN
				UPDATE "article" SET "short_code" = (
					SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
					FROM generate_series(1, 7)
				) WHERE "id" = r.id;
				EXIT;
			EXCEPTION WHEN unique_violation THEN
				-- Code taken: draw another one.
			END;
		END LOOP;
	END LOOP;
END $$;
