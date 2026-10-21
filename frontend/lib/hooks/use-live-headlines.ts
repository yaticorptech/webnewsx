"use client";

import { useEffect, useRef, useState } from "react";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { api } from "@/lib/api";
import type { ArticleCard, Headline } from "@/lib/shared/contracts";

export function headlineFromCard(card: ArticleCard): Headline {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    publishedAt: card.publishedAt,
    author: { username: card.author.username, reporterLevel: card.badges?.reporterLevel ?? null },
  };
}

const FLASH_MS = 2400;

/**
 * Server-provided headlines kept live: `article.published` prepends (flagged in `freshIds` for
 * the flash highlight), `article.deleted` removes, a stream reconnect refetches. A new
 * `initial` (e.g. after router.refresh()) replaces the list.
 */
export function useLiveHeadlines(initial: Headline[], max: number) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [lastInsertAt, setLastInsertAt] = useState(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  if (initial !== source) {
    setSource(initial);
    setItems(initial.slice(0, max));
  }

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  useRealtimeEvent("article.published", (card) => {
    const headline = headlineFromCard(card);
    setItems((prev) => [headline, ...prev.filter((h) => h.id !== headline.id)].slice(0, max));
    setFreshIds((prev) => new Set(prev).add(headline.id));
    setLastInsertAt(Date.now());
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(headline.id);
        return next;
      });
    }, FLASH_MS);
    timers.current.add(timer);
  });

  useRealtimeEvent("article.deleted", ({ id }) => {
    setItems((prev) => prev.filter((h) => h.id !== id));
  });

  useRealtimeReconnect(() => {
    api
      .headlines(max)
      .then(({ items: fresh }) => setItems(fresh.slice(0, max)))
      .catch(() => {});
  });

  // The server render came back without headlines (e.g. the API was restarting): fetch them here, retrying a few
  // times, so the strip never stays on its empty message while stories exist.
  const needsFetch = initial.length === 0;
  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      api
        .headlines(max)
        .then(({ items: fresh }) => {
          if (cancelled) return;
          if (fresh.length > 0) setItems((prev) => (prev.length > 0 ? prev : fresh.slice(0, max)));
          else if (n < 3) timer = setTimeout(() => attempt(n + 1), 5000 * (n + 1));
        })
        .catch(() => {
          if (!cancelled && n < 3) timer = setTimeout(() => attempt(n + 1), 5000 * (n + 1));
        });
    };
    attempt(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [needsFetch, max]);

  return { items, freshIds, lastInsertAt };
}
