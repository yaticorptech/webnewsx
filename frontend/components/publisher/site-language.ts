import "server-only";

import { cookies } from "next/headers";
import { SITE_LANGUAGE_COOKIE, type PublicSite, type SiteLanguage } from "@/lib/shared/contracts";
import { pickSiteLanguage } from "./site-i18n";

/** The language a publisher page renders in: the visitor's toggle (cookie), else the owner's default. */
export async function siteLanguageFor(site: Pick<PublicSite, "language">): Promise<SiteLanguage> {
  return pickSiteLanguage((await cookies()).get(SITE_LANGUAGE_COOKIE)?.value, site.language);
}
