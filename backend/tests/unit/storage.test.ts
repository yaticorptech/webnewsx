import { describe, expect, it } from "vitest";
import { KEY_PATTERN, LocalStorage, contentTypeForKey } from "../../src/lib/storage.js";

describe("LocalStorage path safety", () => {
  const storage = new LocalStorage("/srv/uploads");

  it("resolves normal keys inside the root", () => {
    expect(storage.resolvePath("covers/u1/a.webp")).toBe("/srv/uploads/covers/u1/a.webp");
  });

  it.each(["../etc/passwd", "covers/../../etc/passwd", "covers/./x.webp", "covers\\..\\x", "a\0b", ""])("rejects %j", (key) => {
    expect(storage.resolvePath(key)).toBeNull();
  });

  it("maps URLs back to keys only for well-formed keys", () => {
    expect(storage.keyFromUrl("/media/avatars/u1/abc.webp")).toBe("avatars/u1/abc.webp");
    expect(storage.keyFromUrl("/media/../secret")).toBeNull();
    expect(storage.keyFromUrl("https://evil.test/media/avatars/u1/abc.webp")).toBeNull();
    expect(KEY_PATTERN.test("avatars/u1/../x.webp")).toBe(false);
  });

  it("knows content types", () => {
    expect(contentTypeForKey("x/y/z.webp")).toBe("image/webp");
    expect(contentTypeForKey("x/y/z.bin")).toBe("application/octet-stream");
  });
});
