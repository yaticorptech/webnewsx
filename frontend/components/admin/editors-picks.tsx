"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Pin, PinOff } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AdminStoryRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { SubHeading } from "./section-header";
import { StoryThumb } from "./story-thumb";

/** Editor's Picks slots (backend `pin_limit`). */
export const MAX_PICKS = 3;

type EditorsPicksProps = {
  initial: AdminStoryRow[] | null;
  onUnpin: (story: AdminStoryRow) => void;
};

/**
 * Editor's Picks (max 3, ordered): they lead page 1 of For You and Latest for everyone.
 * Reorder by dragging the grip or with the arrow buttons (keyboard); each change is saved at once.
 */
export function EditorsPicks({ initial, onUnpin }: EditorsPicksProps) {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.adminPins,
    queryFn: ({ signal }) => api.admin.pins(signal),
    initialData: initial ? { items: initial } : undefined,
    staleTime: 15_000,
  });
  const picks = data?.items ?? [];
  const serverOrder = picks.map((p) => p.id).join(",");

  // Local order while dragging; resynced whenever the server's order changes.
  const [order, setOrder] = useState<string[]>(() => picks.map((p) => p.id));
  const [syncedFrom, setSyncedFrom] = useState(serverOrder);
  if (syncedFrom !== serverOrder) {
    setSyncedFrom(serverOrder);
    setOrder(picks.map((p) => p.id));
  }
  const [saving, setSaving] = useState(false);
  const byId = new Map(picks.map((p) => [p.id, p]));
  const ordered = order.map((id) => byId.get(id)).filter((p): p is AdminStoryRow => Boolean(p));

  const save = async (ids: string[]) => {
    if (ids.join(",") === serverOrder) return;
    setSaving(true);
    try {
      const result = await api.admin.reorderPins(ids);
      client.setQueryData(qk.adminPins, result);
      toast.success("Editor's Picks reordered", { description: "The new order leads the feeds now." });
    } catch (error) {
      setOrder(picks.map((p) => p.id));
      toast.error("Couldn't reorder the picks", { description: errorMessage(error) });
    } finally {
      setSaving(false);
      void client.invalidateQueries({ queryKey: qk.adminAll });
      void client.invalidateQueries({ queryKey: qk.feedAll });
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    void save(next);
  };

  return (
    <section aria-labelledby="desk-picks" className="panel-tint flex flex-col gap-4 p-4 sm:p-5">
      <SubHeading
        id="desk-picks"
        title="Editor's Picks"
        aside={
          <span className="kicker text-muted" aria-live="polite">
            {saving ? "Saving order…" : `${picks.length} of ${MAX_PICKS} slots`}
          </span>
        }
      />
      <p className="-mt-2 text-sm text-muted">Pinned stories lead the first page of For You and Latest for every reader, in this order.</p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-2">
        {ordered.map((story, i) => (
          <PickRow
            key={story.id}
            story={story}
            index={i}
            count={ordered.length}
            onMove={(delta) => move(i, delta)}
            onDrop={() => void save(order)}
            onUnpin={() => onUnpin(story)}
          />
        ))}
      </Reorder.Group>
      {picks.length < MAX_PICKS && (
        <>
          <ol className={cn("grid gap-2", picks.length === 0 && "sm:grid-cols-3")} start={picks.length + 1}>
            {Array.from({ length: MAX_PICKS - picks.length }, (_, i) => (
              <li
                key={i}
                className="flex h-12 items-center gap-3 rounded-xl border border-dashed border-tint-border bg-surface/60 px-4 text-sm text-muted"
              >
                <span className="font-wide text-lg font-black text-tint-border">{picks.length + i + 1}</span>
                Empty slot
                <Pin aria-hidden className="ml-auto size-4 text-tint-border" />
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            Pin a live story from its <span className="font-bold text-ink-2">⋯</span> menu in the list below.
          </p>
        </>
      )}
    </section>
  );
}

type PickRowProps = {
  story: AdminStoryRow;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onDrop: () => void;
  onUnpin: () => void;
};

function PickRow({ story, index, count, onMove, onDrop, onUnpin }: PickRowProps) {
  const controls = useDragControls();
  const handleRef = useRef<HTMLButtonElement>(null);
  // Stop the page from scrolling while a touch drag starts on the grip.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const prevent = (event: TouchEvent) => event.preventDefault();
    handle.addEventListener("touchstart", prevent, { passive: false });
    return () => handle.removeEventListener("touchstart", prevent);
  }, []);

  const iconButton =
    "inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint-2 hover:text-brand disabled:pointer-events-none disabled:opacity-30";
  const title = story.title || "Untitled story";

  return (
    <Reorder.Item
      value={story.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="relative flex items-center gap-2 rounded-xl border border-border bg-surface p-2 pr-1 shadow-card sm:gap-3 sm:pr-2"
      whileDrag={{ scale: 1.02, boxShadow: "var(--elev-pop)" }}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Drag to reorder “${title}”`}
        onPointerDown={(event) => controls.start(event)}
        className="hidden size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-2 hover:text-brand active:cursor-grabbing sm:inline-flex"
        tabIndex={-1}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <span aria-label={`Pick ${index + 1}`} className="w-6 shrink-0 text-center font-wide text-2xl font-black leading-none text-brand">
        {index + 1}
      </span>
      <StoryThumb src={story.coverUrl} blur={story.coverBlur} className="w-16 sm:w-20" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink sm:line-clamp-1">{title}</p>
        <UserHandle username={story.author.username} truncate className="flex text-xs text-muted" />
      </div>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move “${title}” up`} className={iconButton}>
          <ArrowUp aria-hidden className="size-4" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move “${title}” down`} className={iconButton}>
          <ArrowDown aria-hidden className="size-4" />
        </button>
        <button type="button" onClick={onUnpin} aria-label={`Remove “${title}” from Editor's Picks`} className={iconButton}>
          <PinOff aria-hidden className="size-4" />
        </button>
      </div>
    </Reorder.Item>
  );
}
