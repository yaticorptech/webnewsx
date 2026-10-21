import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { handleText } from "@/components/brand/user-handle";
import { ProfileView } from "@/components/profile/profile-view";
import { getProfile, getSaved, getUserArticles, getUserDrafts } from "@/lib/server-api";
import { normalizeUsername, RESERVED_USERNAMES, USERNAME_REGEX } from "@/lib/shared/contracts";
import { absoluteUrl } from "@/lib/utils";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Canonical username for a path segment (`/Harbor.Ledger`, `/@harbor.ledger` → `harbor.ledger`), or null. */
function parseUsername(segment: string): string | null {
  const decoded = safeDecode(segment);
  if (decoded === null) return null;
  const username = normalizeUsername(decoded);
  if (!USERNAME_REGEX.test(username) || RESERVED_USERNAMES.has(username)) return null;
  return username;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const username = parseUsername((await params).username);
  const profile = username ? await getProfile(username) : null;
  if (!profile) return { title: "Profile not found", robots: { index: false } };

  const { user, counts } = profile;
  const title = `${user.name} (${handleText(user.username)})`;
  const description =
    user.bio?.replace(/\s+/g, " ").trim() ||
    `${counts.articles} ${counts.articles === 1 ? "story" : "stories"} by ${user.name} on WebNEWS.`;
  const image = user.image ? absoluteUrl(user.image) : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/${user.username}` },
    openGraph: {
      type: "profile",
      title,
      description,
      url: `/${user.username}`,
      username: user.username,
      images: image ? [{ url: image, width: 512, height: 512, alt: user.name }] : undefined,
    },
    twitter: { card: "summary", title, description, images: image ? [image] : undefined },
  };
}

/**
 * Public profile (SPEC §3.7, §3.11). Unknown or not-yet-onboarded usernames → branded 404. The owner
 * also gets their Desk (drafts / in review / returned) and Saved tabs, server-rendered for instant switching.
 */
export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ username: segment }, query] = await Promise.all([params, searchParams]);
  const username = parseUsername(segment);
  if (!username) notFound();

  const tab = typeof query.tab === "string" && /^(drafts|desk|saved|published|reported|press-meet)$/.test(query.tab) ? query.tab : null;
  if (safeDecode(segment) !== username) redirect(`/${username}${tab ? `?tab=${tab}` : ""}`);

  const profile = await getProfile(username);
  if (!profile) notFound();

  const self = profile.viewer.isSelf;
  const [published, drafts, saved] = await Promise.all([
    getUserArticles(username),
    self ? getUserDrafts(username) : Promise.resolve(null),
    self ? getSaved() : Promise.resolve(null),
  ]);

  return (
    <ProfileView
      profile={profile}
      initialPublished={published}
      initialDrafts={drafts}
      initialSaved={saved}
    />
  );
}
