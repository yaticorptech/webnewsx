import { describe, expect, it } from "vitest";
import { normalizeSignUpBody } from "../../src/lib/auth-request.js";
import { isGoogleAvatarUrl, largeGoogleAvatarUrl } from "../../src/lib/avatar.js";

describe("normalizeSignUpBody", () => {
  it("defaults a missing name to an empty string (UI sends only email + password)", () => {
    expect(normalizeSignUpBody({ email: "a@b.test", password: "12345678" })).toEqual({ email: "a@b.test", password: "12345678", name: "" });
  });

  it("keeps a provided name (trimmed, ≤ 50 chars) and drops a client-supplied image", () => {
    expect(normalizeSignUpBody({ email: "a@b.test", password: "x", name: "  Jane  ", image: "https://evil.test/p.png" })).toEqual({
      email: "a@b.test",
      password: "x",
      name: "Jane",
    });
    expect((normalizeSignUpBody({ name: "x".repeat(80) }).name as string).length).toBe(50);
    expect(normalizeSignUpBody({ name: 42 }).name).toBe("");
  });
});

describe("Google avatar guards", () => {
  it("only accepts https URLs on googleusercontent.com hosts", () => {
    expect(isGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(true);
    expect(isGoogleAvatarUrl("https://googleusercontent.com/x")).toBe(true);
    expect(isGoogleAvatarUrl("http://lh3.googleusercontent.com/a/abc")).toBe(false);
    expect(isGoogleAvatarUrl("https://googleusercontent.com.evil.test/a")).toBe(false);
    expect(isGoogleAvatarUrl("https://evilgoogleusercontent.com/a")).toBe(false);
    expect(isGoogleAvatarUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isGoogleAvatarUrl("/media/avatars/u/x.webp")).toBe(false);
  });

  it("asks Google for a 512px square", () => {
    expect(largeGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc=s512-c");
    expect(largeGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc=s64")).toBe("https://lh3.googleusercontent.com/a/abc=s512-c");
    expect(largeGoogleAvatarUrl("https://lh3.googleusercontent.com/a/abc")).toBe("https://lh3.googleusercontent.com/a/abc");
  });
});
