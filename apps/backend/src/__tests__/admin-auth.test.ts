import { afterEach, describe, expect, it, vi } from "vitest";

// Next.js enforces the server-only marker; the test runner does not.
vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@repo/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/database")>()),
  db: database.db,
}));

const { getAllowedAdminEmails, isAllowedAdminEmail } = await import(
  "@/lib/admin-auth"
);
const { requestAdminLoginCode, verifyAdminLoginCode } = await import(
  "@/lib/admin-login"
);

afterEach(() => {
  vi.unstubAllEnvs();
  database.db.mockReset();
});

describe("admin allowlist", () => {
  it("normalizes BACKEND_ADMIN_EMAILS", () => {
    vi.stubEnv("BACKEND_ADMIN_EMAILS", " Ops@Acme.com, ,second@acme.com ");
    expect([...getAllowedAdminEmails()]).toEqual([
      "ops@acme.com",
      "second@acme.com",
    ]);
    expect(isAllowedAdminEmail("  OPS@acme.com")).toBe(true);
    expect(isAllowedAdminEmail("intruder@acme.com")).toBe(false);
  });

  it("allows nobody when the allowlist is empty", () => {
    vi.stubEnv("BACKEND_ADMIN_EMAILS", "");
    expect(isAllowedAdminEmail("ops@acme.com")).toBe(false);
  });
});

describe("admin sign-in codes", () => {
  it("never touches the database for emails outside the allowlist", async () => {
    vi.stubEnv("BACKEND_ADMIN_EMAILS", "ops@acme.com");
    await requestAdminLoginCode("intruder@acme.com");
    expect(
      await verifyAdminLoginCode("intruder@acme.com", "123456"),
    ).toBeNull();
    expect(database.db).not.toHaveBeenCalled();
  });

  it("rejects malformed codes before any lookup", async () => {
    vi.stubEnv("BACKEND_ADMIN_EMAILS", "ops@acme.com");
    expect(await verifyAdminLoginCode("ops@acme.com", "12ab56")).toBeNull();
    expect(await verifyAdminLoginCode("ops@acme.com", "1234567")).toBeNull();
    expect(database.db).not.toHaveBeenCalled();
  });
});
