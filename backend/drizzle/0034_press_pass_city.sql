ALTER TABLE "press_pass" ADD COLUMN "city" text;--> statement-breakpoint
-- Owner 2026-10-05: passes from before the City field get one from their district — Karnataka: the district's
-- headquarters; elsewhere the district was typed as "District or city", so it is the city.
UPDATE "press_pass" SET "city" = CASE
  WHEN "state" = 'KA' THEN CASE "district"
    WHEN 'Bagalkote' THEN 'Bagalkote'
    WHEN 'Ballari' THEN 'Ballari'
    WHEN 'Belagavi' THEN 'Belagavi'
    WHEN 'Bengaluru Rural' THEN 'Doddaballapura'
    WHEN 'Bengaluru Urban' THEN 'Bengaluru'
    WHEN 'Bidar' THEN 'Bidar'
    WHEN 'Chamarajanagar' THEN 'Chamarajanagar'
    WHEN 'Chikkaballapur' THEN 'Chikkaballapur'
    WHEN 'Chikkamagaluru' THEN 'Chikkamagaluru'
    WHEN 'Chitradurga' THEN 'Chitradurga'
    WHEN 'Dakshina Kannada' THEN 'Mangaluru'
    WHEN 'Davanagere' THEN 'Davanagere'
    WHEN 'Dharwad' THEN 'Dharwad'
    WHEN 'Gadag' THEN 'Gadag'
    WHEN 'Hassan' THEN 'Hassan'
    WHEN 'Haveri' THEN 'Haveri'
    WHEN 'Kalaburagi' THEN 'Kalaburagi'
    WHEN 'Kodagu' THEN 'Madikeri'
    WHEN 'Kolar' THEN 'Kolar'
    WHEN 'Koppal' THEN 'Koppal'
    WHEN 'Mandya' THEN 'Mandya'
    WHEN 'Mysuru' THEN 'Mysuru'
    WHEN 'Raichur' THEN 'Raichur'
    WHEN 'Ramanagara (Bengaluru South)' THEN 'Ramanagara'
    WHEN 'Shivamogga' THEN 'Shivamogga'
    WHEN 'Tumakuru' THEN 'Tumakuru'
    WHEN 'Udupi' THEN 'Udupi'
    WHEN 'Uttara Kannada' THEN 'Karwar'
    WHEN 'Vijayanagara' THEN 'Hosapete'
    WHEN 'Vijayapura' THEN 'Vijayapura'
    WHEN 'Yadgir' THEN 'Yadgir'
  END
  ELSE nullif(trim("district"), '')
END
WHERE "city" IS NULL;
