/**
 * Legal entity & contact details (owner-supplied, 2026-09-24). No postal address anywhere on the site (owner
 * 2026-10-05). Single source for /about, /contact and the Terms & Privacy pages — edit here only.
 */
export const COMPANY = {
  brand: "WebNewsX",
  legalName: "Webnews Network Private Limited",
  country: "India",
  // contact@webnews.in removed — webnews.in is a separate domain (owner 2026-11-20); the owner adds WebNewsX's own
  // address later. While empty, every "write to us" points at /contact instead (CONTACT below).
  email: "" as string,
  social: [
    { key: "facebook", label: "WebNewsX on Facebook", href: "https://www.facebook.com/profile.php?id=61590461440147" },
    // @webnews_in belongs to webnews.in — a separate domain, not WebNewsX (owner 2026-11-20). Add WebNewsX's own here.
  ],
} as const;

/** Where "write to us" goes: the email when there is one, else the /contact page. */
export const CONTACT = COMPANY.email
  ? { href: `mailto:${COMPANY.email}`, label: COMPANY.email }
  : { href: "/contact", label: "our Contact us page" };
