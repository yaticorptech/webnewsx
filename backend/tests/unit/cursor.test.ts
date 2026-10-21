import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, paginate } from "../../src/lib/cursor.js";
import { ApiError } from "../../src/lib/errors.js";

describe("cursor", () => {
  it("round-trips (timestamp, id)", () => {
    const at = new Date("2026-09-24T10:11:12.345Z");
    const id = "4f1c1d7e-0000-4000-8000-000000000001";
    const encoded = encodeCursor(at, id);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual({ at, id });
  });

  it("treats empty as no cursor", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it.each(["garbage", Buffer.from("[1,2]").toString("base64url"), Buffer.from('["not-a-date","x"]').toString("base64url")])(
    "rejects malformed cursor %s with 400",
    (raw) => {
      try {
        decodeCursor(raw);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).code).toBe("invalid_cursor");
      }
    },
  );

  it("paginates with limit + 1 rows", () => {
    const rows = [1, 2, 3].map((n) => ({ n, at: new Date(2026, 0, n), id: `id${n}` }));
    const page = paginate(rows, 2, (r) => ({ at: r.at, id: r.id }));
    expect(page.items.map((r) => r.n)).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor)).toEqual({ at: rows[1]!.at, id: "id2" });
    expect(paginate(rows, 3, (r) => ({ at: r.at, id: r.id })).nextCursor).toBeNull();
  });
});
