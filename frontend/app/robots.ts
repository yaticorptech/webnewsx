import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/** robots.txt: stories, profiles and the public pages are open to search engines; accounts and the console aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // The stories' 1200×630 share images live under /api/ (more specific rules win, so this beats the disallow).
        allow: ["/", "/api/articles/*/og.jpg"],
        disallow: ["/admin", "/api/", "/publish", "/settings", "/newsroom", "/press-pass", "/onboarding", "/login", "/signup", "/dev"],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/news-sitemap.xml`],
  };
}
