/*
 * A fresh mix on every visit (owner 2026-10-05: "every refresh shows different articles", Home and Search): Latest and
 * the category pages ask the API for a shuffled order (recent stories first) with a new random seed. The seed rides
 * in the next pages' cursors (`s.<seed>.<offset>`), so one visit's pages follow on without repeats.
 */

export function newShuffleSeed(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(8, "0");
}

/**
 * A logged-out visitor's mix (owner 2026-10-22: "old and latest articles mixed on top, then sign in to read more"):
 * the same shuffled order — recent stories first, in a mixed order — but with one seed for the whole day (India's
 * date), so a refresh shows the same stories open and the same ones blurred (owner 2026-10-08: a refresh must never
 * swap a locked story into view), and the server's first page and the browser's next pages agree.
 */
export function visitorShuffleSeed(): string {
  const india = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `day${india.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** The seed a shuffled page belongs to (from its cursor), or its stories' order when it's the last page. */
export function shuffleSignature(page: { items: readonly { id: string }[]; nextCursor: string | null }): string {
  const seed = page.nextCursor?.startsWith("s.") ? page.nextCursor.split(".")[1] : null;
  return seed ?? page.items.map((item) => item.id).join(",");
}
