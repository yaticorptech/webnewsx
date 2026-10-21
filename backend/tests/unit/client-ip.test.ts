import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor } from "../../src/lib/client-ip.js";
import { signViewerId, verifyViewerId } from "../../src/lib/viewer-id.js";

describe("clientIpFromForwardedFor", () => {
  it("takes the entry the trusted proxy appended, never the client-written left side", () => {
    // Client sent "X-Forwarded-For: 6.6.6.6"; our one trusted proxy appended the real address.
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIpFromForwardedFor("6.6.6.6, 7.7.7.7, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIpFromForwardedFor("203.0.113.9", 1)).toBe("203.0.113.9");
    // Two trusted proxies: the second-from-right entry is the client.
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9");
    expect(clientIpFromForwardedFor("2001:db8::1", 1)).toBe("2001:db8::1");
  });

  it("ignores the header when no proxy is trusted, or when the entry isn't an IP", () => {
    expect(clientIpFromForwardedFor("203.0.113.9", 0)).toBeNull();
    expect(clientIpFromForwardedFor("", 1)).toBeNull();
    expect(clientIpFromForwardedFor(undefined, 1)).toBeNull();
    expect(clientIpFromForwardedFor("1.2.3.4, not-an-ip", 1)).toBeNull();
    expect(clientIpFromForwardedFor(" , ", 1)).toBeNull();
  });
});

describe("viewer ids (wn_vid)", () => {
  it("accepts only ids this server signed", () => {
    const id = crypto.randomUUID();
    const signed = signViewerId(id);
    expect(verifyViewerId(signed)).toBe(id);
    expect(verifyViewerId(id)).toBeNull(); // legacy / made-up unsigned id
    expect(verifyViewerId(`${crypto.randomUUID()}.${signed.split(".")[1]}`)).toBeNull(); // signature of another id
    expect(verifyViewerId(`${signed}x`)).toBeNull();
    expect(verifyViewerId(`not-a-uuid.${signed.split(".")[1]}`)).toBeNull();
    expect(verifyViewerId(undefined)).toBeNull();
  });
});
