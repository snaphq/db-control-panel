import { beforeEach, describe, expect, it, vi } from "vitest";

// Each db() query resolves to the next queued result, in call order.
const queuedResults: unknown[][] = [];
const updates: Array<Record<string, unknown>> = [];
const limits: number[] = [];

function chain(): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  const self = () => node;
  node.from = self;
  node.where = self;
  node.orderBy = self;
  node.limit = (value: number) => {
    limits.push(value);
    return node;
  };
  node.set = (values: Record<string, unknown>) => {
    updates.push(values);
    return node;
  };
  node.returning = self;
  // biome-ignore lint/suspicious/noThenProperty: mimics Drizzle's thenable query builders.
  node.then = (
    resolve: (value: unknown[]) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(queuedResults.shift() ?? []).then(resolve, reject);
  return node;
}

vi.mock("@repo/database", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  db: () => ({ select: chain, update: chain }),
}));

vi.mock("@/lib/operators/management", () => ({
  MAX_OPERATOR_TOKEN_LABEL: 60,
}));

const {
  clampActivityLimit,
  listOperatorActivity,
  normalizeOperatorTokenLabel,
  serializeOperatorActivity,
  serializeOperatorDetail,
  sortOperatorTokensForDetail,
  updateOwnedOperatorTokenLabel,
} = await import("./operators/detail");

const owner = { userId: "user_1", tenantId: "tenant_1", operatorId: "op_1" };
const operatorRow = {
  id: "op_1",
  name: "Claude",
  description: null,
  status: "active",
  scope: { mode: "all_owned" },
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-02T00:00:00.000Z"),
};

function token(id: string, createdAt: string, revokedAt: string | null) {
  return {
    id,
    label: null,
    tokenPrefix: `opt_${id}`,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(createdAt),
    revokedAt: revokedAt ? new Date(revokedAt) : null,
  };
}

beforeEach(() => {
  queuedResults.length = 0;
  updates.length = 0;
  limits.length = 0;
});

describe("normalizeOperatorTokenLabel", () => {
  it("trims labels and maps empty values to null", () => {
    expect(normalizeOperatorTokenLabel("  laptop  ")).toEqual({
      ok: true,
      label: "laptop",
    });
    expect(normalizeOperatorTokenLabel("   ")).toEqual({
      ok: true,
      label: null,
    });
    expect(normalizeOperatorTokenLabel(null)).toEqual({
      ok: true,
      label: null,
    });
  });

  it("rejects labels over the max length after trimming", () => {
    expect(normalizeOperatorTokenLabel(` ${"a".repeat(60)} `).ok).toBe(true);
    expect(normalizeOperatorTokenLabel("a".repeat(61))).toEqual({
      ok: false,
      error: "label_too_long",
    });
  });
});

describe("clampActivityLimit", () => {
  it("defaults to 50 and clamps to 1..200", () => {
    expect(clampActivityLimit(undefined)).toBe(50);
    expect(clampActivityLimit(Number.NaN)).toBe(50);
    expect(clampActivityLimit(0)).toBe(1);
    expect(clampActivityLimit(-5)).toBe(1);
    expect(clampActivityLimit(20.7)).toBe(20);
    expect(clampActivityLimit(1000)).toBe(200);
  });
});

describe("sortOperatorTokensForDetail", () => {
  it("orders active first, then revoked, newest first within each group", () => {
    const sorted = sortOperatorTokensForDetail([
      token("revoked_old", "2026-09-01T00:00:00Z", "2026-09-05T00:00:00Z"),
      token("active_old", "2026-09-02T00:00:00Z", null),
      token("revoked_new", "2026-09-04T00:00:00Z", "2026-09-06T00:00:00Z"),
      token("active_new", "2026-09-03T00:00:00Z", null),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      "active_new",
      "active_old",
      "revoked_new",
      "revoked_old",
    ]);
  });
});

describe("serializers", () => {
  it("serializes operator detail dates to ISO strings", () => {
    const view = serializeOperatorDetail({
      ...operatorRow,
      scope: { mode: "all_owned" },
      tokens: [token("t1", "2026-09-03T00:00:00Z", "2026-09-04T00:00:00Z")],
    });
    expect(view).toMatchObject({
      id: "op_1",
      scope: { mode: "all_owned" },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      tokens: [
        {
          id: "t1",
          expiresAt: null,
          lastUsedAt: null,
          createdAt: "2026-09-03T00:00:00.000Z",
          revokedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
  });

  it("maps unparseable scopes to unknown", () => {
    const view = serializeOperatorDetail({
      ...operatorRow,
      scope: null,
      tokens: [],
    });
    expect(view.scope).toEqual({ mode: "unknown" });
  });

  it("serializes activity entries", () => {
    const entry = {
      id: "act_1",
      credentialId: "t1",
      eventType: "mcp_tool_response",
      toolName: "show_content",
      method: null,
      statusCode: null,
      durationMs: 12,
      success: true,
      error: null,
      createdAt: new Date("2026-09-03T00:00:00Z"),
    };
    expect(serializeOperatorActivity(entry)).toEqual({
      ...entry,
      createdAt: "2026-09-03T00:00:00.000Z",
    });
  });
});

describe("updateOwnedOperatorTokenLabel", () => {
  const args = { ...owner, tokenId: "t1" };

  it("rejects over-long labels before touching the database", async () => {
    const result = await updateOwnedOperatorTokenLabel({
      ...args,
      label: "a".repeat(61),
    });
    expect(result).toEqual({
      ok: false,
      error: "label_too_long",
      status: 400,
    });
    expect(updates).toHaveLength(0);
  });

  it("returns token_not_found when the operator is not owned", async () => {
    queuedResults.push([]);
    const result = await updateOwnedOperatorTokenLabel({ ...args, label: "x" });
    expect(result).toMatchObject({ error: "token_not_found", status: 404 });
    expect(updates).toHaveLength(0);
  });

  it("returns token_not_found when the token is missing", async () => {
    queuedResults.push([operatorRow], []);
    const result = await updateOwnedOperatorTokenLabel({ ...args, label: "x" });
    expect(result).toMatchObject({ error: "token_not_found", status: 404 });
  });

  it("returns token_revoked for revoked tokens", async () => {
    queuedResults.push([operatorRow], [{ id: "t1", revokedAt: new Date() }]);
    const result = await updateOwnedOperatorTokenLabel({ ...args, label: "x" });
    expect(result).toMatchObject({ error: "token_revoked", status: 409 });
    expect(updates).toHaveLength(0);
  });

  it("returns token_revoked when revoked between read and write", async () => {
    queuedResults.push([operatorRow], [{ id: "t1", revokedAt: null }], []);
    const result = await updateOwnedOperatorTokenLabel({ ...args, label: "x" });
    expect(result).toMatchObject({ error: "token_revoked", status: 409 });
  });

  it("writes the trimmed label and returns the updated token", async () => {
    const updated = {
      ...token("t1", "2026-09-03T00:00:00Z", null),
      label: "ci",
    };
    queuedResults.push(
      [operatorRow],
      [{ id: "t1", revokedAt: null }],
      [updated],
    );
    const result = await updateOwnedOperatorTokenLabel({
      ...args,
      label: "  ci  ",
    });
    expect(result).toEqual({ ok: true, token: updated });
    expect(updates).toEqual([{ label: "ci" }]);
  });

  it("clears the label when given an empty string", async () => {
    queuedResults.push(
      [operatorRow],
      [{ id: "t1", revokedAt: null }],
      [token("t1", "2026-09-03T00:00:00Z", null)],
    );
    await updateOwnedOperatorTokenLabel({ ...args, label: "" });
    expect(updates).toEqual([{ label: null }]);
  });
});

describe("listOperatorActivity", () => {
  it("returns [] when the operator is not owned", async () => {
    queuedResults.push([]);
    expect(await listOperatorActivity(owner)).toEqual([]);
  });

  it("applies the clamped limit to the activity query", async () => {
    queuedResults.push([operatorRow], [{ id: "act_1" }]);
    const entries = await listOperatorActivity({ ...owner, limit: 999 });
    expect(entries).toEqual([{ id: "act_1" }]);
    // First limit(1) is the ownership lookup.
    expect(limits).toEqual([1, 200]);
  });
});
