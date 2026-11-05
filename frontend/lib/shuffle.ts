/*
 * A fresh mix on every visit (owner 2026-10-05: "every refresh shows different articles", Home and Search): Latest and
 * the category pages ask the API for a shuffled order (recent stories first) with a new random seed. The seed rides
 * in the next pages' cursors (`s.<seed>.<offset>`), so one visit's pages follow on without repeats.
 */

export function newShuffleSeed(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(8, "0");
}

/**
 * A logged-out visitor's seed: a fresh one per visit too (owner 2026-11-05: the newest day's stories change order on
 * every refresh — replaces the one-seed-per-day mix). The seed still rides in the next pages' cursors, so the server's
 * first page and the browser's next pages agree.
 */
export function visitorShuffleSeed(): string {
  return newShuffleSeed();
}

/** The seed a shuffled page belongs to (from its cursor), or its stories' order when it's the last page. */
export function shuffleSignature(page: { items: readonly { id: string }[]; nextCursor: string | null }): string {
  const seed = page.nextCursor?.startsWith("s.") ? page.nextCursor.split(".")[1] : null;
  return seed ?? page.items.map((item) => item.id).join(",");
}
