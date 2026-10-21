"use client";

import { BarChart3, FolderInput, Sparkles, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { DeleteStoryDialog } from "@/components/article/delete-story-button";
import { SpotlightSheet, type SpotlightStory } from "@/components/newsroom/spotlight-sheet";
import { useViewer } from "@/components/providers/viewer-provider";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { canPublish, isEditorDesk, type ArticleCard } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { CategoryDialog } from "./category-dialog";

type MenuStory = Pick<ArticleCard, "id" | "title" | "coverUrl" | "coverBlur" | "publishedAt" | "hidden" | "category" | "district"> & {
  author: Pick<ArticleCard["author"], "id">;
  viewer: Pick<ArticleCard["viewer"], "isAuthor">;
};

export type StoryMenuProps = {
  article: MenuStory;
  /** "xs": a small trigger with a narrower panel, for profile grid tiles. */
  size?: "xs" | "sm" | "md";
  /** Open the panel upwards (feed card footers sit at the bottom of the card). */
  up?: boolean;
  /** Which trigger edge the panel lines up with ("start" = it opens to the right). */
  align?: "start" | "end";
  /** Items above the author's / desk's own (Home's YouTube-style cards: Save · Share · Report). */
  leadItems?: DropdownItem[];
  /** Was the vertical ⋮ trigger; every menu shows the WebNEWS three bars now (owner 2026-10-05). Ignored. */
  vertical?: boolean;
  /** No Delete item (the story page, which has its own Delete button). */
  noDelete?: boolean;
  /** Another trigger icon instead of the three bars (the phone feed cards: ⋮ on the photo). */
  trigger?: ReactNode;
  /** Extra classes on the trigger button (e.g. white on a photo). */
  triggerClassName?: string;
  className?: string;
};

/**
 * The "⋯" menu on a story (feed card and article page) — only when there's something in it: the story's own
 * Reporter / Editor Desk author gets **Spotlight this story** (paid boost flow), **Newsroom stats** and
 * **Change category**, and every author **Delete** (owner 2026-10-01, after a confirmation); the Editor Desk gets
 * **Change category** on anyone's story. Reporting a story is its own button (ReportButton), not in here.
 */
export function StoryMenu({
  article,
  size = "sm",
  up = true,
  align = "end",
  leadItems = [],
  noDelete = false,
  trigger,
  triggerClassName,
  className,
}: StoryMenuProps) {
  const viewer = useViewer();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  // Mount the sheets on first use only (every feed card has a menu).
  const [spotlightMounted, setSpotlightMounted] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryMounted, setCategoryMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMounted, setDeleteMounted] = useState(false);

  const isOwn = article.viewer.isAuthor || (viewer !== null && viewer.id === article.author.id);

  const items: DropdownItem[] = [];
  const moveItem: DropdownItem = {
    label: "Change category…",
    icon: <FolderInput aria-hidden />,
    onSelect: () => {
      setCategoryMounted(true);
      setCategoryOpen(true);
    },
  };
  if (isOwn) {
    if (canPublish(viewer)) {
      if (!article.hidden) {
        items.push({
          label: "Spotlight this story",
          icon: <Sparkles aria-hidden />,
          onSelect: () => {
            setSpotlightMounted(true);
            setSpotlightOpen(true);
          },
        });
      }
      items.push({ label: "Newsroom stats", icon: <BarChart3 aria-hidden />, href: "/newsroom" });
    }
    items.push(moveItem);
    if (!noDelete && viewer?.username) {
      items.push({ type: "separator" });
      items.push({
        label: "Delete",
        icon: <Trash2 aria-hidden />,
        danger: true,
        onSelect: () => {
          setDeleteMounted(true);
          setDeleteOpen(true);
        },
      });
    }
  } else if (isEditorDesk(viewer)) {
    items.push(moveItem);
  }
  if (leadItems.length > 0) items.unshift(...leadItems, ...(items.length > 0 ? [{ type: "separator" } satisfies DropdownItem] : []));
  if (items.length === 0) return null;

  const md = size === "md";
  const spotlightStory: SpotlightStory = {
    id: article.id,
    title: article.title,
    coverUrl: article.coverUrl,
    coverBlur: article.coverBlur,
    publishedAt: article.publishedAt,
  };

  return (
    <>
      <DropdownMenu
        label="More story actions"
        align={align}
        items={items}
        className={className}
        triggerClassName={cn(
          "relative inline-flex items-center justify-center rounded-full text-muted transition-colors duration-150",
          "after:absolute after:-inset-1.5 after:content-[''] hover:bg-tint hover:text-brand aria-expanded:bg-tint aria-expanded:text-brand",
          md ? "size-10 [&_svg]:size-5" : size === "xs" ? "size-7 [&_svg]:size-4" : "size-9 [&_svg]:size-4.5",
          triggerClassName,
        )}
        // The WebNEWS three bars instead of ⋮ / ⋯ (owner 2026-10-05), a little smaller to sit like the other icons.
        trigger={trigger ?? <SpeedBarsSvg className="scale-[0.8]" />}
        menuClassName={cn(
          size === "xs" ? "min-w-48" : "min-w-60",
          up && "bottom-full top-auto mb-2 mt-0",
          up && (align === "start" ? "origin-bottom-left" : "origin-bottom-right"),
        )}
      />
      {spotlightMounted && <SpotlightSheet story={spotlightStory} open={spotlightOpen} onOpenChange={setSpotlightOpen} />}
      {categoryMounted && <CategoryDialog article={article} open={categoryOpen} onOpenChange={setCategoryOpen} />}
      {deleteMounted && viewer?.username && (
        <DeleteStoryDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          articleId={article.id}
          title={article.title}
          authorUsername={viewer.username}
        />
      )}
    </>
  );
}
