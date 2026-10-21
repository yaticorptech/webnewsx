/**
 * Scripts of India's languages stack vowel signs above and conjuncts below the base line (Devanagari … Sinhala,
 * U+0900–U+0DFF — Kannada is U+0C80–U+0CFF; Ol Chiki for Santali; Meetei Mayek for Manipuri) or sit tall
 * (Perso-Arabic for Urdu, Sindhi, Kashmiri), so the tight leading and negative tracking of the wide Latin
 * headline cut make lines collide. Headlines and bodies containing them get looser settings.
 */
const INDIC = /[\u0900-\u0DFF\u1C50-\u1C7F\uABC0-\uABFF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasIndicScript(text: string | null | undefined): boolean {
  return Boolean(text && INDIC.test(text));
}

/** Headline override for Indic text: open leading, no negative tracking. */
export const INDIC_HEADLINE = "leading-[1.32] tracking-normal";
