import { describe, expect, it } from "vitest";
import { suggestionStem, usernameCandidates } from "../../src/lib/username.js";
import {
  RESERVED_USERNAMES,
  USERNAME_MESSAGES,
  USERNAME_REGEX,
  normalizeUsername,
  sanitizeUsernameInput,
  validateUsernameFormat,
} from "../../src/shared/contracts.js";

describe("validateUsernameFormat", () => {
  it.each([
    ["jane", true],
    ["jane.doe", true],
    ["j.d.x", true],
    ["abc", true],
    ["a".repeat(30), true],
  ])("accepts %s", (name, ok) => {
    expect(validateUsernameFormat(name).ok).toBe(ok);
    expect(USERNAME_REGEX.test(name)).toBe(true);
  });

  it.each([
    ["ab", "too_short"],
    ["a".repeat(31), "too_long"],
    ["jane_doe", "invalid_chars"],
    ["jane2", "invalid_chars"],
    ["Jane", "invalid_chars"],
    ["jane doe", "invalid_chars"],
    ["jané", "invalid_chars"],
    [".jane", "leading_dot"],
    ["jane.", "trailing_dot"],
    ["jane..doe", "double_dot"],
    ["admin", "reserved"],
    ["login", "reserved"],
    ["web.news", "reserved"],
    ["top", "reserved"],
  ])("rejects %s with %s", (name, code) => {
    const result = validateUsernameFormat(name);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.message).toBe(USERNAME_MESSAGES[result.code as keyof typeof USERNAME_MESSAGES]);
    }
    expect(USERNAME_REGEX.test(name) && !RESERVED_USERNAMES.has(name)).toBe(false);
  });

  it("uses the exact user-facing messages", () => {
    expect(USERNAME_MESSAGES.invalid_chars).toBe("Only letters and dots allowed");
    expect(USERNAME_MESSAGES.double_dot).toBe("No consecutive dots");
    expect(USERNAME_MESSAGES.reserved).toBe("Username is not available");
    expect(USERNAME_MESSAGES.taken).toBe("Username is not available");
  });

  it("reserves every top-level route segment", () => {
    for (const route of ["a", "api", "login", "signup", "onboarding", "publish", "settings", "terms", "privacy", "media", "drafts"]) {
      expect(RESERVED_USERNAMES.has(route)).toBe(true);
    }
  });
});

describe("normalize / sanitize input", () => {
  it("normalizes for storage", () => {
    expect(normalizeUsername("  @Jane.Doe ")).toBe("jane.doe");
  });
  it("strips disallowed characters while typing", () => {
    expect(sanitizeUsernameInput("Jane_Doe-99!")).toBe("janedoe");
    expect(sanitizeUsernameInput("x".repeat(40))).toHaveLength(30);
  });
});

describe("username suggestions", () => {
  it("only produces valid letters-and-dots usernames", () => {
    for (const base of ["jane.doe", "admin", "x", "Jane_Doe99", "a".repeat(30), "...", "news", "web.news"]) {
      const candidates = usernameCandidates(base);
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      for (const candidate of candidates) {
        expect(candidate).toMatch(/^[a-z.]+$/);
        expect(validateUsernameFormat(candidate).ok).toBe(true);
        expect(candidate).not.toBe(base);
      }
      expect(new Set(candidates).size).toBe(candidates.length);
    }
  });

  it("derives a clean stem", () => {
    expect(suggestionStem("Jane__Doe..x.")).toBe("janedoe.x");
    expect(suggestionStem("1")).toBe("reader");
  });
});
