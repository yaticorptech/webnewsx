ALTER TABLE "article" ADD COLUMN "language" text;--> statement-breakpoint
CREATE INDEX "article_language_feed_idx" ON "article" USING btree ("language","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "article"."status" = 'published';--> statement-breakpoint
-- Existing stories: their language from the headline's script (Kannada, Devanagari → Hindi, …), English otherwise.
UPDATE "article" SET "language" = CASE
  WHEN coalesce("title", '') ~ '[ಀ-೿]' THEN 'kn'
  WHEN coalesce("title", '') ~ '[ऀ-ॿ]' THEN 'hi'
  WHEN coalesce("title", '') ~ '[ഀ-ൿ]' THEN 'ml'
  WHEN coalesce("title", '') ~ '[஀-௿]' THEN 'ta'
  WHEN coalesce("title", '') ~ '[ఀ-౿]' THEN 'te'
  WHEN coalesce("title", '') ~ '[ঀ-৿]' THEN 'bn'
  WHEN coalesce("title", '') ~ '[઀-૿]' THEN 'gu'
  WHEN coalesce("title", '') ~ '[਀-੿]' THEN 'pa'
  WHEN coalesce("title", '') ~ '[଀-୿]' THEN 'or'
  WHEN coalesce("title", '') ~ '[؀-ۿ]' THEN 'ur'
  ELSE 'en'
END WHERE "language" IS NULL;
