"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, Crown, FilePen, FilePlus2, Flag, LayoutGrid, PenLine, Presentation } from "lucide-react";
import { membershipHref } from "@/components/feed/premium";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMetered } from "@/components/auth/read-meter";
import { GRID_CLASS } from "@/components/profile/grid-parts";
import { BLURRED_CARDS, BlurredCards, FREE_CARDS } from "@/components/auth/read-wall";
import { UserHandle, handleText } from "@/components/brand/user-handle";
import { FollowButton } from "@/components/follow/follow-button";
import { PressMeetInvitationsTab } from "@/components/press-meet/invitations-tab";
import { PressPassPromo } from "@/components/presspass/press-pass-promo";
import { ReviewProgress } from "@/components/presspass/review-progress";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TabPanel, Tabs, type TabItem } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useNativeApp } from "@/lib/hooks/use-native-app";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { useStartAtTop } from "@/lib/hooks/use-start-at-top";
import { qk } from "@/lib/query-keys";
import { canPublish, type ArticleCard, type DraftCard, type Page, type ProfileData } from "@/lib/shared/contracts";
import { ProfileGrid } from "./article-grid";
import { ArticleTile, DraftTile } from "./article-tile";
import { FollowListModal } from "./follow-list-modal";
import {
  bumpArticleCount,
  flattenPages,
  hasItem,
  patchStats,
  prependItem,
  removeItem,
  toPages,
  type Pages,
} from "./profile-cache";
import { ProfileHeader } from "./profile-header";
import { ReportedList } from "./reported-list";
import { SavedGrid, useSavedStories } from "./saved-grid";
import { type FollowListKind } from "./stats-band";

/**
 * `drafts` = the "Drafts" tab (drafts, stories in review, returned stories; "Desk" until owner 2026-10-08) — URL
 * `?tab=drafts` (alias `desk`).
 * `reported` = the owner's reported stories (owner 2026-09-28) — URL `?tab=reported` (the bell links there).
 * `press-meet` = a reporter's press meet invitations (owner 2026-10-01) — URL `?tab=press-meet`.
 */
export type ProfileTab = "published" | "members" | "drafts" | "saved" | "reported" | "press-meet";

export type ProfileViewProps = {
  profile: ProfileData;
  initialPublished: Page<ArticleCard>;
  /** The owner's first drafts page (null for everyone else). */
  initialDrafts: Page<DraftCard> | null;
  /** The owner's first "Saved" page (null for everyone else). */
  initialSaved: Page<ArticleCard> | null;
};

const TABS_ID = "profile-tabs";
/** Tiles above the fold get eager images. */
const EAGER_TILES = 6;

type TabRules = { isSelf: boolean; hasDesk: boolean; hasPressMeet: boolean; hasMembers: boolean; fallback: ProfileTab };

function tabFromUrl(value: string | null, { isSelf, hasDesk, hasPressMeet, hasMembers, fallback }: TabRules): ProfileTab {
  if (hasMembers && value === "members") return "members";
  if (isSelf && hasDesk && (value === "drafts" || value === "desk")) return "drafts";
  if (isSelf && hasPressMeet && value === "press-meet") return "press-meet";
  if (isSelf && value === "saved") return "saved";
  if (isSelf && value === "reported") return "reported";
  if (value === "published") return "published";
  return fallback;
}

/**
 * Profile page body (SPEC §3.7): press-card header, stats band, Published | Drafts tabs and the
 * infinite grids. Server data seeds the TanStack caches; follows update the follower count
 * optimistically and realtime events keep the grid and stats live.
 */
export function ProfileView({ profile: initialProfile, initialPublished, initialDrafts, initialSaved }: ProfileViewProps) {
  const username = initialProfile.user.username;
  const queryClient = useQueryClient();
  const viewer = useViewer();
  // Opened from a reel several screens down the feed: start at the profile card, not the footer.
  useStartAtTop();

  const profileQuery = useQuery({
    queryKey: qk.profile(username),
    queryFn: ({ signal }) => api.profile(username, signal),
    initialData: initialProfile,
  });
  const profile = profileQuery.data;
  const { isSelf } = profile.viewer;
  const serverFollows = profile.viewer.follows;
  // Own profile: publishing controls follow the viewer's role (SPEC §3.2, §3.11).
  const selfViewer = isSelf && viewer?.username === username ? viewer : null;
  const reporter = canPublish(selfViewer);
  const trainee = selfViewer?.role === "reporter" && selfViewer.reporterLevel === "trainee" ? selfViewer : null;

  // Live "viewer follows" state shared with every FollowButton for this username.
  const { data: following } = useQuery({
    queryKey: qk.followState(username),
    queryFn: () => serverFollows,
    initialData: serverFollows,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  // Re-align the shared follow state with each fresh server read (unless a follow is in flight).
  useEffect(() => {
    if (queryClient.isMutating() > 0) return;
    queryClient.setQueryData(qk.followState(username), serverFollows);
  }, [queryClient, username, serverFollows, profileQuery.dataUpdatedAt]);

  // Own profile: follows made anywhere on the page (rail, followers list) change "Following" —
  // refetch the counts after any successful mutation (follows are the only ones on this page).
  useEffect(() => {
    if (!isSelf) return;
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        void queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      }
    });
  }, [isSelf, queryClient, username]);

  // Optimistic follower count: server count ± the not-yet-refetched local follow change.
  const followerDelta = following === serverFollows ? 0 : following ? 1 : -1;
  const counts = { ...profile.counts, followers: Math.max(0, profile.counts.followers + followerDelta) };

  /* ─────────── Grids ─────────── */

  const published = useInfiniteQuery({
    queryKey: qk.userArticles(username),
    queryFn: ({ pageParam, signal }) => api.userArticles(username, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: toPages(initialPublished),
    // An empty first page while the profile counts stories means the server read failed → refetch.
    initialDataUpdatedAt: initialPublished.items.length === 0 && initialProfile.counts.articles > 0 ? 0 : undefined,
  });

  const drafts = useInfiniteQuery({
    queryKey: qk.userDrafts(username),
    queryFn: ({ pageParam, signal }) => api.userDrafts(username, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: initialDrafts ? toPages(initialDrafts) : undefined,
    enabled: isSelf,
  });

  const saved = useSavedStories(initialSaved, isSelf);

  const premiumStories = useInfiniteQuery({
    queryKey: [...qk.userArticles(username), "premium"],
    queryFn: ({ pageParam, signal }) => api.userPremiumArticles(username, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: (profile.membership?.premiumCount ?? 0) > 0,
  });

  const reported = useQuery({
    queryKey: qk.reportedStories,
    queryFn: ({ signal }) => api.reportedStories(signal),
    enabled: isSelf,
    staleTime: 60_000,
  });
  const reportedItems = reported.data?.items ?? [];

  const publishedItems = flattenPages(published.data);
  // Visitors (logged out) see FREE_CARDS of a reporter's stories open, BLURRED_CARDS blurred, no more pages.
  const gated = useMetered();
  const draftItems = flattenPages(drafts.data);
  // Readers can't write; their Desk only appears if they still have drafts from a former pass. In the app, Drafts is
  // an option in Settings instead (owner 2026-10-09), so no tab here.
  const inApp = useNativeApp();
  const hasDesk = isSelf && !inApp && (reporter || draftItems.length > 0);

  /* ─────────── Tabs (URL: ?tab=drafts) ─────────── */

  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A Reader's own profile opens on Saved when they have no stories of their own.
  const fallback: ProfileTab = isSelf && !reporter && profile.counts.articles === 0 ? "saved" : "published";
  // Reporters (and the Editor Desk) get invited to cover press meets (owner 2026-10-01).
  const hasPressMeet = isSelf && reporter;
  // "Members only" (owner 2026-10-14, like YouTube): their premium stories, once they have any.
  const membership = profile.membership ?? null;
  const hasMembers = (membership?.premiumCount ?? 0) > 0;
  const tabRules: TabRules = { isSelf, hasDesk, hasPressMeet, hasMembers, fallback };
  const urlTab = tabFromUrl(searchParams.get("tab"), tabRules);
  const [tab, setTab] = useState<ProfileTab>(urlTab);
  const [syncedUrlTab, setSyncedUrlTab] = useState<ProfileTab>(urlTab);
  if (urlTab !== syncedUrlTab) {
    // Navigated to ?tab=… (e.g. the user menu's "Drafts" link) while already on this profile.
    setSyncedUrlTab(urlTab);
    setTab(urlTab);
  }

  // The header's "Articles" count (owner 2026-10-10): the Published tab, scrolled into view.
  const showArticles = () => {
    selectTab("published");
    document.getElementById("profile-stories")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectTab = (value: string) => {
    const next = tabFromUrl(value, tabRules);
    setTab(next);
    setSyncedUrlTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === fallback) params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    // Native history API: syncs useSearchParams without a server round-trip.
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  };

  // Icon + label, no counts (owner 2026-09-28 mockup; the story count is in the stats strip).
  const tabItems: TabItem[] = [{ value: "published", label: <TabLabel icon={<LayoutGrid aria-hidden />}>Articles</TabLabel> }];
  if (hasMembers) {
    tabItems.push({ value: "members", label: <TabLabel icon={<Crown aria-hidden />}>Members only</TabLabel> });
  }
  if (hasDesk) {
    tabItems.push({
      value: "drafts",
      // "Drafts" (SPEC §3.11; owner 2026-10-08, was "Desk"): drafts, stories at the Review Desk and returned stories.
      label: (
        <TabLabel icon={<FilePen aria-hidden />}>
          Drafts<span className="sr-only"> and stories in review</span>
        </TabLabel>
      ),
    });
  }
  if (isSelf) {
    tabItems.push({ value: "saved", label: <TabLabel icon={<Bookmark aria-hidden />}>Saved</TabLabel> });
  }
  if (hasPressMeet) {
    tabItems.push({ value: "press-meet", label: <TabLabel icon={<Presentation aria-hidden />}>Press meet</TabLabel> });
  }
  // Only once one of their stories has been reported (or when the bell brought them here).
  if (isSelf && (reportedItems.length > 0 || tab === "reported")) {
    tabItems.push({ value: "reported", label: <TabLabel icon={<Flag aria-hidden />}>Reported</TabLabel> });
  }

  // Phones (owner 2026-10-09): a sideways swipe moves to the next / previous tab (Articles → Drafts → Saved → Press
  // meet), like the bottom bar's sections elsewhere — the page is marked data-no-swipe="tabs" so the bar's own swipe
  // leaves it to this.
  useSwipe(
    true,
    (direction) => {
      const index = tabItems.findIndex((item) => item.value === tab);
      const next = tabItems[index + (direction === "left" ? 1 : -1)];
      if (next) selectTab(next.value);
    },
    { ignore: '[data-no-swipe]:not([data-no-swipe="tabs"])' },
  );

  /* ─────────── Followers / Following modal ─────────── */

  const [listOpen, setListOpen] = useState(false);
  const [listKind, setListKind] = useState<FollowListKind>("followers");
  const openList = (kind: FollowListKind) => {
    setListKind(kind);
    setListOpen(true);
  };

  /* ─────────── Realtime ─────────── */

  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const userId = profile.user.id;

  useRealtimeEvent("article.published", (card) => {
    if (card.author.id !== userId) return;
    const key = qk.userArticles(username);
    const current = queryClient.getQueryData<Pages<ArticleCard>>(key);
    if (hasItem(current, card.id)) return;
    queryClient.setQueryData<Pages<ArticleCard>>(key, (data) => prependItem(data, card));
    queryClient.setQueryData<ProfileData>(qk.profile(username), (data) => bumpArticleCount(data, 1));
    // A published draft leaves the Drafts tab.
    queryClient.setQueryData<Pages<DraftCard>>(qk.userDrafts(username), (data) => removeItem(data, card.id));
    setFreshIds((ids) => new Set(ids).add(card.id));
  });

  useRealtimeEvent("article.stats", (stats) => {
    queryClient.setQueryData<Pages<ArticleCard>>(qk.userArticles(username), (data) => patchStats(data, stats));
  });

  useRealtimeEvent("article.deleted", ({ id }) => {
    const key = qk.userArticles(username);
    if (hasItem(queryClient.getQueryData<Pages<ArticleCard>>(key), id)) {
      queryClient.setQueryData<Pages<ArticleCard>>(key, (data) => removeItem(data, id));
      queryClient.setQueryData<ProfileData>(qk.profile(username), (data) => bumpArticleCount(data, -1));
    }
    queryClient.setQueryData<Pages<DraftCard>>(qk.userDrafts(username), (data) => removeItem(data, id));
  });

  // Catch up on anything missed while the stream was down.
  useRealtimeReconnect(() => {
    void queryClient.invalidateQueries({ queryKey: qk.profile(username) });
    void queryClient.invalidateQueries({ queryKey: qk.userArticles(username) });
    if (isSelf) void queryClient.invalidateQueries({ queryKey: qk.userDrafts(username) });
  });

  /* ─────────── Render ─────────── */

  return (
    // data-page="profile": the masthead drops its category row here (globals.css).
    <div data-page="profile" data-grid-page="" data-no-swipe="tabs" className="flex flex-col gap-4 sm:gap-5">
      <ProfileHeader
        user={profile.user}
        isSelf={isSelf}
        initialFollowing={serverFollows}
        verified={profile.press?.level === "verified" || profile.user.role === "admin"}
        counts={counts}
        onOpenList={openList}
        onShowArticles={showArticles}
      />
      {isSelf && selfViewer && !reporter && (
        <PressPassPromo
          name={profile.user.name}
          image={profile.user.image}
          revoked={selfViewer.pressPass?.status === "revoked"}
        />
      )}
      {trainee && (
        <section aria-label="Trainee progress" className="card flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <ReviewProgress approved={trainee.pressPass?.approvedCount ?? 0} compact className="min-w-0 flex-1" />
          <Button href="/press-pass" variant="ghost" size="sm" rightIcon={<ArrowRight aria-hidden />} className="self-start sm:self-auto">
            Your Press Pass
          </Button>
        </section>
      )}

      {membership && !isSelf && membership.priceInr !== null && (
        <MembershipBar name={profile.user.name} username={username} activeUntil={membership.activeUntil} />
      )}

      <div id="profile-stories" className="mt-2 scroll-mt-[calc(var(--nav-h,4rem)+0.75rem)]">
        <Tabs
          id={TABS_ID}
          ariaLabel="Profile sections"
          value={tab}
          onValueChange={selectTab}
          items={tabItems}
          size="lg"
          // Three tabs must fit a 320px phone: spread them instead of the fixed desktop gap.
          className={
            tabItems.length > 3
              ? // Four or five tabs: they scroll sideways on phones rather than squeeze.
                "no-scrollbar max-sm:gap-5 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-[400px]:*:[[role=tab]]:text-sm"
              : tabItems.length > 2
                ? "max-sm:justify-between max-sm:gap-1 max-[400px]:*:[[role=tab]]:text-sm"
                : undefined
          }
        />

        <TabPanel tabsId={TABS_ID} value="published" active={tab === "published"} className="pt-4 sm:pt-5">
          <ProfileGrid
            label={`Stories by ${handleText(username)}`}
            items={gated ? publishedItems.slice(0, FREE_CARDS) : publishedItems}
            freshIds={freshIds}
            renderItem={(article, index) => (
              <ArticleTile
                article={article}
                isNew={freshIds.has(article.id)}
                priority={index < EAGER_TILES}
                menuAlign={index % 3 === 0 ? "start" : "end"}
              />
            )}
            hasNextPage={Boolean(published.hasNextPage) && (!gated || publishedItems.length < FREE_CARDS + BLURRED_CARDS)}
            isFetchingNextPage={published.isFetchingNextPage}
            isError={published.isFetchNextPageError}
            onLoadMore={() => void published.fetchNextPage()}
            empty={
              isSelf && reporter ? (
                <EmptyState
                  kicker="Your byline"
                  title="Your first story starts here"
                  description={
                    trainee
                      ? "Publish an article and the Review Desk will check it — once approved it lands here and at the top of every live feed."
                      : "Publish a story and it lands on your profile — and at the top of every live feed."
                  }
                  action={
                    <Button href="/publish" leftIcon={<PenLine aria-hidden />}>
                      Publish your first article
                    </Button>
                  }
                />
              ) : isSelf ? (
                <EmptyState
                  kicker="Your byline"
                  title="No stories under your name yet"
                  description="Readers follow, like and save. Get your Press Pass to start publishing."
                  action={
                    <Button href="/press-pass" rightIcon={<ArrowRight aria-hidden />}>
                      Get your Press Pass
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  kicker="No stories yet"
                  title={
                    <>
                      <UserHandle username={username} wrap /> hasn’t published yet
                    </>
                  }
                  description="Follow them to see their first story in your Following feed the moment it goes live."
                  action={<FollowButton username={username} initialFollowing={serverFollows} />}
                />
              )
            }
          />
          {/* Logged out (owner 2026-10-08, as Home): the next stories blurred under "Sign in to read". */}
          {gated && publishedItems.length > FREE_CARDS && (
            <BlurredCards articles={publishedItems.slice(FREE_CARDS, FREE_CARDS + BLURRED_CARDS)} gridClassName={GRID_CLASS} />
          )}
        </TabPanel>

        {hasMembers && (
          <TabPanel tabsId={TABS_ID} value="members" active={tab === "members"} className="pt-4 sm:pt-5">
            <ProfileGrid
              label={`Members-only stories by ${handleText(username)}`}
              items={flattenPages(premiumStories.data)}
              renderItem={(article, index) => (
                <ArticleTile article={article} priority={index < EAGER_TILES} menuAlign={index % 3 === 0 ? "start" : "end"} />
              )}
              hasNextPage={Boolean(premiumStories.hasNextPage)}
              isFetchingNextPage={premiumStories.isFetchingNextPage}
              isError={premiumStories.isFetchNextPageError}
              onLoadMore={() => void premiumStories.fetchNextPage()}
              empty={<EmptyState icon={<Crown aria-hidden />} kicker="Members only" title="No members-only stories yet" />}
            />
          </TabPanel>
        )}

        {hasDesk && (
          <TabPanel tabsId={TABS_ID} value="drafts" active={tab === "drafts"} className="pt-4 sm:pt-5">
            <ProfileGrid
              label="Your desk: drafts and stories in review"
              items={draftItems}
              renderItem={(draft, index) => <DraftTile draft={draft} priority={index < EAGER_TILES} />}
              hasNextPage={drafts.hasNextPage}
              isFetchingNextPage={drafts.isFetchingNextPage}
              isError={drafts.isFetchNextPageError}
              onLoadMore={() => void drafts.fetchNextPage()}
              empty={
                <EmptyState
                  icon={<FilePlus2 aria-hidden />}
                  kicker="Drafts"
                  title="Your desk is clear"
                  description={
                    trainee
                      ? "Drafts, stories waiting at the Review Desk and stories returned with a note all land here."
                      : "Save a draft from the composer and pick it up here whenever you’re ready."
                  }
                  action={
                    reporter ? (
                      <Button href="/publish" leftIcon={<PenLine aria-hidden />}>
                        Start writing
                      </Button>
                    ) : (
                      <Button href="/press-pass" rightIcon={<ArrowRight aria-hidden />}>
                        Get your Press Pass
                      </Button>
                    )
                  }
                />
              }
            />
          </TabPanel>
        )}

        {isSelf && (
          <TabPanel tabsId={TABS_ID} value="saved" active={tab === "saved"} className="pt-4 sm:pt-5">
            <SavedGrid saved={saved} />
          </TabPanel>
        )}

        {hasPressMeet && (
          <TabPanel tabsId={TABS_ID} value="press-meet" active={tab === "press-meet"} className="pt-4 sm:pt-5">
            {tab === "press-meet" && <PressMeetInvitationsTab />}
          </TabPanel>
        )}

        {isSelf && tab === "reported" && (
          <TabPanel tabsId={TABS_ID} value="reported" active className="pt-4 sm:pt-5">
            {reported.isPending ? (
              <div className="flex justify-center py-10">
                <SpeedLinesLoader size="sm" label="Loading your reported stories" />
              </div>
            ) : (
              <ReportedList items={reportedItems} />
            )}
          </TabPanel>
        )}
      </div>

      {/* No site footer card under the grid (owner 2026-10-08: removed). */}

      <FollowListModal
        username={username}
        open={listOpen}
        onOpenChange={setListOpen}
        kind={listKind}
        onKindChange={setListKind}
        counts={{ followers: counts.followers, following: counts.following }}
      />
    </div>
  );
}

function TabLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      {children}
    </span>
  );
}

/**
 * "Join" (owner 2026-10-14, like YouTube): the reporter's premium membership, or until when you're a member. No price
 * here (owner 2026-10-16); Join / Renew opens the plans popup right on the profile.
 */
function MembershipBar({ name, username, activeUntil }: { name: string; username: string; activeUntil: string | null }) {
  const viewer = useViewer();
  // The whole bar opens the checkout (owner 2026-10-16), not only its button; logged out → log in first.
  const href = viewer ? membershipHref(username) : `/login?next=${encodeURIComponent(membershipHref(username))}`;
  return (
    <Link
      href={href}
      aria-label={activeUntil ? `Renew ${name}'s premium membership` : `Join ${name}'s premium membership`}
      className="card flex w-full items-center gap-3 border-amber-300 bg-gradient-to-r from-amber-50 to-surface px-4 py-3.5 text-left transition hover:shadow-md sm:px-6"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[#3b2600]">
        <Crown className="size-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{activeUntil ? "You're a premium member" : `Join ${name}'s premium`}</span>
        <span className="block text-sm text-muted">
          {activeUntil
            ? `Members-only stories open until ${new Date(activeUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
            : "Unlock their members-only stories and exclusive reports"}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold",
          activeUntil ? "border border-border bg-surface text-ink" : "bg-brand text-brand-contrast",
        )}
      >
        {activeUntil ? "Renew" : "Join"}
      </span>
    </Link>
  );
}
