import { describe, expect, it, vi } from "vitest";

// The production module intentionally uses `server-only`; the unit-test runner
// does not provide Next.js's server/client boundary, so replace the marker
// before loading it.
vi.mock("server-only", () => ({}));

const {
  expirationToDate,
  generateOperatorTokenPlaintext,
  hashOperatorToken,
  isOperatorTokenPlaintext,
  isValidExpiration,
  operatorTokenDisplayPrefix,
  parseOperatorScope,
  OPERATOR_TOKEN_DISPLAY_PREFIX_LEN,
  OPERATOR_TOKEN_PREFIX,
} = await import("./auth/operator-token");

describe("operator token plaintext", () => {
  it("uses the opt_ prefix and a URL-safe random payload", () => {
    const token = generateOperatorTokenPlaintext();
    expect(token.startsWith(OPERATOR_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBe(OPERATOR_TOKEN_PREFIX.length + 32);
    expect(token.slice(OPERATOR_TOKEN_PREFIX.length)).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it("generates unique tokens", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateOperatorTokenPlaintext()),
    );
    expect(seen.size).toBe(50);
  });

  it("detects plaintext by prefix only", () => {
    expect(isOperatorTokenPlaintext("opt_abc")).toBe(true);
    expect(isOperatorTokenPlaintext("cet_abc")).toBe(false);
    expect(isOperatorTokenPlaintext("OPT_abc")).toBe(false);
  });
});

describe("operator token hashing and display", () => {
  it("hashes deterministically and distinguishes inputs", () => {
    const a = hashOperatorToken("opt_a");
    expect(a).toBe(hashOperatorToken("opt_a"));
    expect(a).not.toBe(hashOperatorToken("opt_b"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores a display-only prefix", () => {
    const token = generateOperatorTokenPlaintext();
    const prefix = operatorTokenDisplayPrefix(token);
    expect(prefix).toBe(token.slice(0, OPERATOR_TOKEN_DISPLAY_PREFIX_LEN));
    expect(prefix.length).toBe(OPERATOR_TOKEN_DISPLAY_PREFIX_LEN);
    expect(token.startsWith(prefix)).toBe(true);
  });
});

describe("operator token expiration", () => {
  it("maps never to null and durations to future dates", () => {
    expect(expirationToDate("never")).toBeNull();
    const before = Date.now();
    const oneHour = expirationToDate("1h");
    const oneHourMs = oneHour?.getTime() ?? 0;
    expect(oneHour).not.toBeNull();
    expect(oneHourMs).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
    expect(oneHourMs).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000);
  });

  it("validates supported expiration values", () => {
    expect(isValidExpiration("30d")).toBe(true);
    expect(isValidExpiration("never")).toBe(true);
    expect(isValidExpiration("2d")).toBe(false);
    expect(isValidExpiration("")).toBe(false);
  });
});

describe("operator scope parsing", () => {
  it("accepts all_owned", () => {
    expect(parseOperatorScope({ mode: "all_owned" })).toEqual({
      mode: "all_owned",
    });
  });

  it("accepts and dedupes organization lists", () => {
    expect(
      parseOperatorScope({
        mode: "organizations",
        organizationIds: ["org_a", "org_b", "org_a"],
      }),
    ).toEqual({
      mode: "organizations",
      organizationIds: ["org_a", "org_b"],
    });
  });

  it("rejects malformed scopes", () => {
    expect(parseOperatorScope(null)).toBeNull();
    expect(parseOperatorScope("all_owned")).toBeNull();
    expect(parseOperatorScope(["org_a"])).toBeNull();
    expect(parseOperatorScope({ mode: "everything" })).toBeNull();
    expect(parseOperatorScope({ mode: "organizations" })).toBeNull();
    expect(
      parseOperatorScope({ mode: "organizations", organizationIds: [] }),
    ).toBeNull();
    expect(
      parseOperatorScope({ mode: "organizations", organizationIds: [1] }),
    ).toBeNull();
    expect(
      parseOperatorScope({ mode: "organizations", organizationIds: ["  "] }),
    ).toBeNull();
  });
});
