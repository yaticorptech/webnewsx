"use client";

import { Ellipsis, Eye, EyeOff, FileX2, Flag, History, Newspaper, PenLine, Pin, PinOff, SlidersHorizontal, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  categoryLabel,
  type AdminStoriesQuery,
  type AdminStoryRow,
  type AdminStoryStatusFilter,
  type Category,
  type Page,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";
import { EditorsPickChip, SpotlightChip, StoryStatusChip } from "./chips";
import { EditorsPicks, MAX_PICKS } from "./editors-picks";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, SearchBox, Segmented, SelectFilter, TextFilter } from "./list-parts";
import { deskPersonHref } from "./nav";
import { SectionHeader } from "./section-header";
import { StoryPreview } from "./story-preview";
import { StorySummary } from "./story-summary";
import { filtersKey, useUrlFilters } from "./url-state";
import { useDeskList } from "./use-desk-list";
import { useStoryActions } from "./use-story-actions";

export type StoryFilters = {
  status?: AdminStoryStatusFilter;
  q?: string;
  reporter?: string;
  category?: Category;
  from?: string;
  to?: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "published", label: "Live" },
  { value: "hidden", label: "Hidden" },
  { value: "in_review", label: "In review" },
  { value: "returned", label: "Returned" },
  { value: "draft", label: "Drafts" },
] as const satisfies readonly { value: AdminStoryStatusFilter; label: string }[];

const CATEGORY_OPTIONS = [{ value: "", label: "All categories" }, ...CATEGORY_VALUES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))];

/** The API's `to` is exclusive; the date picker means "up to and including that day". */
function toQuery(filters: StoryFilters): AdminStoriesQuery {
  const { to, ...rest } = filters;
  let exclusiveTo: string | undefined;
  if (to) {
    const day = new Date(`${to}T00:00:00Z`);
    if (!Number.isNaN(day.getTime())) exclusiveTo = new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10);
  }
  return { ...rest, to: exclusiveTo };
}

type Pending = { kind: "hide" | "unpublish" | "delete"; story: AdminStoryRow };

type StoriesViewProps = {
  initialFilters: StoryFilters;
  initial: Page<AdminStoryRow> | null;
  initialPins: AdminStoryRow[] | null;
};

/** Every story on WebNEWS: search + filters, moderation (hide / unpublish / delete) and Editor's Picks. */
export function StoriesView({ initialFilters, initial, initialPins }: StoriesViewProps) {
  const [filters, setFilters] = useUrlFilters<StoryFilters>(initialFilters, { status: "all" });
  const [initialKey] = useState(() => filtersKey(initialFilters));
  const key = filtersKey(filters);
  const list = useDeskList({
    queryKey: qk.adminStories(filters),
    fetchPage: (cursor, signal) => api.admin.stories({ ...toQuery(filters), cursor }, signal),
    initial: key === initialKey ? initial : null,
  });
  const actions = useStoryActions();
  // Same query as the Editor's Picks panel (seeded by it) — only read here to know when all slots are taken.
  const { data: pins } = useQuery({ queryKey: qk.adminPins, queryFn: ({ signal }) => api.admin.pins(signal), enabled: false });
  const pinsFull = (pins?.items.length ?? 0) >= MAX_PICKS;
  const [preview, setPreview] = useState<AdminStoryRow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const advancedCount = [filters.reporter, filters.category, filters.from, filters.to].filter(Boolean).length;
  const [showAdvanced, setShowAdvanced] = useState(advancedCount > 0);

  const menuFor = (story: AdminStoryRow): DropdownItem[] => {
    const live = story.status === "published";
    const items: DropdownItem[] = [
      { label: "Preview", icon: <Eye aria-hidden />, onSelect: () => setPreview(story) },
      { label: "Edit story", icon: <PenLine aria-hidden />, href: `/publish/${story.id}` },
    ];
    items.push({ type: "separator" });
    if (live) {
      items.push(
        story.editorsPick
          ? { label: "Remove from Editor's Picks", icon: <PinOff aria-hidden />, onSelect: () => actions.unpin.mutate({ story }) }
          : {
              label: pinsFull ? `Editor's Picks full (${MAX_PICKS})` : "Make Editor's Pick",
              icon: <Pin aria-hidden />,
              disabled: pinsFull,
              onSelect: () => actions.pin.mutate({ story }),
            },
        { label: "Hide from feeds…", icon: <EyeOff aria-hidden />, onSelect: () => setPending({ kind: "hide", story }) },
      );
    }
    if (story.status === "hidden") items.push({ label: "Unhide", icon: <Eye aria-hidden />, onSelect: () => actions.unhide.mutate({ story }) });
    if (live || story.status === "hidden") {
      items.push({ label: "Unpublish…", icon: <FileX2 aria-hidden />, onSelect: () => setPending({ kind: "unpublish", story }) });
    }
    items.push(
      { label: "History", icon: <History aria-hidden />, href: `/admin/audit?target=${story.id}` },
      { type: "separator" },
      { label: "Delete permanently…", icon: <Trash2 aria-hidden />, danger: true, onSelect: () => setPending({ kind: "delete", story }) },
    );
    return items;
  };

  const items = list.items;
  const filtered = key !== filtersKey({ status: "all" });

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Stories"
        description="Every story on WebNEWS. Hide or unpublish what breaks the rules, delete what must go, and choose up to three Editor's Picks."
      />

      <EditorsPicks initial={initialPins} onUnpin={(story) => actions.unpin.mutate({ story })} />

      <section aria-label="All stories" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            label="Story status"
            options={STATUS_OPTIONS}
            value={filters.status ?? "all"}
            onChange={(status) => setFilters({ status })}
          />
          <div className="flex items-center gap-2">
            <SearchBox label="Search stories by title" placeholder="Search titles" value={filters.q ?? ""} onSearch={(q) => setFilters({ q })} />
            <Button
              variant={showAdvanced ? "secondary" : "outline"}
              size="md"
              aria-expanded={showAdvanced}
              aria-controls="story-filters"
              leftIcon={<SlidersHorizontal aria-hidden />}
              onClick={() => setShowAdvanced((v) => !v)}
              className="shrink-0 px-4"
            >
              <span className="max-sm:sr-only">Filters</span>
              {advancedCount > 0 && <span className="rounded-full bg-brand px-1.5 text-[0.6875rem] text-brand-contrast">{advancedCount}</span>}
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              id="story-filters"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="card grid grid-cols-1 gap-3 p-4 min-[480px]:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
                <TextFilter label="Reporter" placeholder="username" value={filters.reporter ?? ""} onCommit={(reporter) => setFilters({ reporter })} />
                <SelectFilter
                  label="Category"
                  value={filters.category ?? ""}
                  options={CATEGORY_OPTIONS}
                  onChange={(category) => setFilters({ category: (category || undefined) as Category | undefined })}
                />
                <TextFilter label="From" type="date" value={filters.from ?? ""} onCommit={(from) => setFilters({ from })} />
                <TextFilter label="To" type="date" value={filters.to ?? ""} onCommit={(to) => setFilters({ to })} />
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={() => setFilters({ reporter: undefined, category: undefined, from: undefined, to: undefined })}
                    disabled={advancedCount === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <LiveCount>{list.isSuccess ? `${items.length}${list.hasNextPage ? "+" : ""} stories` : ""}</LiveCount>

        {list.isPending ? (
          <ListLoading label="Loading stories" />
        ) : list.isError && items.length === 0 ? (
          <ListError message="The story list didn't load." onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <ListEmpty
            icon={<Newspaper aria-hidden />}
            title={filtered ? "No stories match" : "No stories yet"}
            description={filtered ? "Try another status, a shorter search or clear the filters." : "Stories appear here as soon as reporters file them."}
          />
        ) : (
          <DayGroups
            stories={items}
            pinsFull={pinsFull}
            onRead={setPreview}
            onPin={(story) => (story.editorsPick ? actions.unpin.mutate({ story }) : actions.pin.mutate({ story }))}
            onUnpublish={(story) => setPending({ kind: "unpublish", story })}
            menuFor={menuFor}
          />
        )}
        <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </section>

      <StoryPreview
        story={preview}
        onOpenChange={(open) => !open && setPreview(null)}
        actions={
          preview?.status === "hidden" ? (
            <Button
              variant="secondary"
              leftIcon={<Eye aria-hidden />}
              onClick={() => {
                actions.unhide.mutate({ story: preview });
                setPreview(null);
              }}
            >
              Unhide
            </Button>
          ) : preview?.status === "published" ? (
            <Button
              variant="secondary"
              leftIcon={<EyeOff aria-hidden />}
              onClick={() => {
                setPending({ kind: "hide", story: preview });
                setPreview(null);
              }}
            >
              Hide from feeds
            </Button>
          ) : null
        }
      />

      <ActionDialog
        open={pending?.kind === "hide"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Hide this story?"
        description="It disappears from every feed, profile and search right away. The reporter is notified and still sees it, marked hidden. You can undo this."
        confirmLabel="Hide story"
        confirmIcon={<EyeOff aria-hidden />}
        note={{ label: "Reason", placeholder: "e.g. Unverified claims, hate speech in the quotes…", required: true, requiredMessage: "Give a reason", maxLength: 500 }}
        onConfirm={async (reason) => {
          if (pending) await actions.hide.mutateAsync({ story: pending.story, reason });
        }}
      >
        {pending && <StorySummary story={pending.story} />}
      </ActionDialog>

      <ActionDialog
        open={pending?.kind === "unpublish"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Unpublish this story?"
        description="It goes back to the reporter's drafts as “returned”, with your reason shown to them. They can fix it and publish again."
        confirmLabel="Unpublish"
        confirmIcon={<FileX2 aria-hidden />}
        note={{ label: "Reason for the reporter", placeholder: "Optional — what needs to change", maxLength: 1000 }}
        onConfirm={async (reason) => {
          if (pending) await actions.unpublish.mutateAsync({ story: pending.story, reason });
        }}
      >
        {pending && <StorySummary story={pending.story} />}
      </ActionDialog>

      <ActionDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Delete this story permanently?"
        description="The story, its likes, views and reports are removed for good. This can't be undone."
        confirmLabel="Delete permanently"
        confirmIcon={<Trash2 aria-hidden />}
        note={{ label: "Reason (kept in the audit log)", placeholder: "Optional", maxLength: 500 }}
        onConfirm={async (reason) => {
          if (pending) await actions.remove.mutateAsync({ story: pending.story, reason });
        }}
      >
        {pending && <StorySummary story={pending.story} />}
      </ActionDialog>
    </div>
  );
}

/* ─────────────── Stories by day (owner 2026-10-16: a newsroom CMS's article list) ─────────────── */

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const DAY_TITLE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" });
const WHEN = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const storyTime = (story: AdminStoryRow) => story.publishedAt ?? story.submittedAt ?? story.updatedAt;

function dayTitle(key: string): string {
  const today = IST_DAY.format(new Date());
  const yesterday = IST_DAY.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return DAY_TITLE.format(new Date(`${key}T12:00:00+05:30`));
}

const ROW_BUTTON = "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors";

function DayGroups({
  stories,
  pinsFull,
  onRead,
  onPin,
  onUnpublish,
  menuFor,
}: {
  stories: AdminStoryRow[];
  pinsFull: boolean;
  onRead: (story: AdminStoryRow) => void;
  onPin: (story: AdminStoryRow) => void;
  onUnpublish: (story: AdminStoryRow) => void;
  menuFor: (story: AdminStoryRow) => DropdownItem[];
}) {
  const days: { key: string; stories: AdminStoryRow[] }[] = [];
  for (const story of stories) {
    const key = IST_DAY.format(new Date(storyTime(story)));
    const day = days[days.length - 1];
    if (day?.key === key) day.stories.push(story);
    else days.push({ key, stories: [story] });
  }
  return (
    <div className="flex flex-col gap-8">
      {days.map((day) => (
        <section key={day.key} aria-label={dayTitle(day.key)} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-serif text-xl font-semibold text-ink">{dayTitle(day.key)}</h3>
            <span className="rounded-full bg-tint px-2.5 py-0.5 text-xs font-medium text-brand">
              {day.stories.length} {day.stories.length === 1 ? "story" : "stories"}
            </span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
            <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Title", "Category", "Author", "Date & time", "Status", ""].map((head) => (
                    <th key={head} scope="col" className="whitespace-nowrap px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      {head || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {day.stories.map((story) => {
                  const live = story.status === "published";
                  return (
                    <tr key={story.id} className="transition-colors hover:bg-[#fafafa]">
                      <td className="max-w-0 px-4 py-3 md:w-full">
                        <button type="button" onClick={() => onRead(story)} className="block max-w-full truncate text-left font-medium text-ink hover:text-brand">
                          {story.title || "Untitled story"}
                        </button>
                        {(story.editorsPick || story.spotlight || story.openFlags > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {story.editorsPick && <EditorsPickChip order={story.pinOrder} />}
                            {story.spotlight && <SpotlightChip />}
                            {story.openFlags > 0 && (
                              <Link href="/admin/flags" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                                <Flag aria-hidden className="size-3" />
                                {story.openFlags} open report{story.openFlags === 1 ? "" : "s"}
                              </Link>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{story.category ? categoryLabel(story.category, story.district) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        <Link href={deskPersonHref(story.author.username)} className="hover:text-brand">
                          {story.author.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted tabular-nums">{WHEN.format(new Date(storyTime(story)))}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StoryStatusChip status={story.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {live && (
                            <button
                              type="button"
                              onClick={() => onPin(story)}
                              disabled={!story.editorsPick && pinsFull}
                              aria-pressed={story.editorsPick}
                              title={story.editorsPick ? "Remove from Editor's Picks" : pinsFull ? `Editor's Picks full (${MAX_PICKS})` : "Make Editor's Pick"}
                              className={cn(ROW_BUTTON, "w-9 px-0", story.editorsPick ? "border-brand/40 bg-tint text-brand" : "border-border text-muted hover:text-ink", "disabled:opacity-40")}
                            >
                              <Pin aria-hidden className="size-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => onRead(story)} className={cn(ROW_BUTTON, "border-brand/40 text-brand hover:bg-tint")}>
                            Read
                          </button>
                          {/* The Editor Desk edits any story in the composer (owner 2026-10-31); it stays the reporter's. */}
                          <a href={`/publish/${story.id}`} className={cn(ROW_BUTTON, "gap-1.5 border-border text-ink hover:bg-surface-2")}>
                            <PenLine aria-hidden className="size-3.5" />
                            Edit
                          </a>
                          {live && story.slug && (
                            <a href={`/a/${story.slug}`} target="_blank" rel="noopener" className={cn(ROW_BUTTON, "border-[#bfe3c8] text-[#1f7a3d] hover:bg-[#f1faf3]")}>
                              View live
                            </a>
                          )}
                          {(live || story.status === "hidden") && (
                            <button type="button" onClick={() => onUnpublish(story)} className={cn(ROW_BUTTON, "border-[#f1d9a6] text-[#9a6200] hover:bg-[#fff8ea]")}>
                              Unpublish
                            </button>
                          )}
                          <DropdownMenu
                            label={`More for “${story.title || "Untitled story"}”`}
                            trigger={<Ellipsis aria-hidden className="size-4" />}
                            triggerClassName={cn(ROW_BUTTON, "w-9 border-border px-0 text-muted hover:text-ink")}
                            items={menuFor(story)}
                            floating
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
