/*
 * A fresh mix on every visit (owner 2026-10-05: "every refresh shows different articles", Home and Search): Latest and
 * the category pages ask the API for a shuffled order (recent stories first) with a new random seed. The seed rides
 * in the next pages' cursors (`s.<seed>.<offset>`), so one visit's pages follow on without repeats.
 */

export function newShuffleSeed(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(8, "0");
}

/** The seed a shuffled page belongs to (from its cursor), or its stories' order when it's the last page. */
export function shuffleSignature(page: { items: readonly { id: string }[]; nextCursor: string | null }): string {
  const seed = page.nextCursor?.startsWith("s.") ? page.nextCursor.split(".")[1] : null;
  return seed ?? page.items.map((item) => item.id).join(",");
}
