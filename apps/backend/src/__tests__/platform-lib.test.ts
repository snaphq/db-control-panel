import type {
  AdminSafekeeper,
  AdminSafekeeperLayout,
  PlatformOperation,
} from "@repo/control-plane-contract";
import {
  ControlPlaneConfigError,
  ControlPlaneNotFoundError,
  ControlPlaneUnavailableError,
} from "@repo/core/control-plane/errors";
import { describe, expect, it, vi } from "vitest";

// Next.js enforces the server-only marker; the test runner does not.
vi.mock("server-only", () => ({}));

const { describeLayout } = await import("@/lib/platform/layout");
const { toUnavailable, loadPlatform } = await import("@/lib/platform/load");
const format = await import("@/lib/platform/format");
const { describeTrigger, formatOutput, stepRows, hasActiveOperation } =
  await import("@/lib/platform/operations");

const layout: AdminSafekeeperLayout = {
  desired_count: 3,
  target_per_node: { "1": 1, "2": 1, "3": 1 },
  create_on_nodes: [],
  next_move: null,
  stranded: [],
  blocked: null,
};

const safekeeper = (
  id: number,
  state: AdminSafekeeper["state"],
): AdminSafekeeper => ({
  id,
  node_id: 1,
  node_name: "hel-1",
  availability_zone: `az-${id}`,
  hostname: `sk-${id}`,
  state,
  operation_id: null,
  drain: null,
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-03T10:00:00.000Z",
  retired_at: null,
});

const names = new Map([
  [1, "hel-1"],
  [2, "hel-2"],
  [3, "hel-3"],
]);

const operation = (
  over: Partial<PlatformOperation> = {},
): PlatformOperation => ({
  id: "op_1",
  action: "safekeepers.spread",
  status: "running",
  failures_count: 0,
  error: null,
  params: { reason: "manual" },
  progress: {
    completed_steps: ["plan", "create"],
    outputs: { ready: { wait: 1 } },
  },
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-03T10:00:00.000Z",
  finished_at: null,
  ...over,
});

describe("describeLayout", () => {
  it("says nothing needs to move when the layout is as wide as the nodes allow", () => {
    const lines = describeLayout(
      layout,
      [
        safekeeper(1, "active"),
        safekeeper(2, "active"),
        safekeeper(3, "active"),
      ],
      names,
    );
    expect(lines[0]).toMatchObject({ tone: "good" });
    expect(lines[0]?.text).toContain(
      "set to run 3 safekeepers and 3 are running",
    );
    expect(lines.map((l) => l.text)).toContain(
      "Spread as widely as the Ready nodes allow, the target is: hel-1 1, hel-2 1, hel-3 1.",
    );
    expect(lines.at(-1)?.text).toContain("Nothing to move");
  });

  it("explains the next move, missing safekeepers, stranded ones and a blocked plan", () => {
    const lines = describeLayout(
      {
        ...layout,
        create_on_nodes: [2],
        next_move: { remove_safekeeper: 4, from_node_id: 1, to_node_id: 3 },
        stranded: [7, 8],
        blocked: "no eligible Ready node",
      },
      [safekeeper(1, "active"), safekeeper(2, "retired")],
      names,
    );
    const text = lines.map((l) => l.text).join("\n");
    expect(text).toContain("1 missing safekeeper will be started on hel-2");
    expect(text).toContain("move safekeeper 4 from hel-1 to hel-3");
    expect(text).toContain(
      "Safekeepers 7, 8 sit on a node that is gone or not Ready",
    );
    expect(text).toContain(
      "Nothing can be planned right now: no eligible Ready node",
    );
    expect(text).not.toContain("Nothing to move");
    expect(lines[0]).toMatchObject({ tone: "warn" });
  });

  it("falls back to node ids for nodes it could not name", () => {
    const lines = describeLayout(
      { ...layout, target_per_node: { "9": 2 } },
      [],
      new Map(),
    );
    expect(lines[1]?.text).toContain("node 9 2");
  });
});

describe("format", () => {
  it("formats sizes, cores and timestamps", () => {
    expect(format.formatBytes(null)).toBe("unknown");
    expect(format.formatBytes(16 * 1024 ** 3)).toBe("16 GiB");
    expect(format.formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GiB");
    expect(format.formatCpu(8000)).toBe("8 cores");
    expect(format.formatCpu(500)).toBe("0.50 cores");
    expect(format.formatCpu(null)).toBe("unknown");
    expect(format.formatTimestamp("2026-10-03T10:00:05.123Z")).toBe(
      "2026-10-03 10:00:05 UTC",
    );
    expect(format.formatTimestamp(null)).toBe("-");
  });

  it("formats durations, using now for an operation that has not finished", () => {
    const start = "2026-10-03T10:00:00.000Z";
    expect(format.formatDuration(start, "2026-10-03T10:00:42.000Z")).toBe(
      "42s",
    );
    expect(format.formatDuration(start, "2026-10-03T10:03:05.000Z")).toBe(
      "3m 05s",
    );
    expect(format.formatDuration(start, "2026-10-03T11:02:00.000Z")).toBe(
      "1h 02m",
    );
    expect(
      format.formatDuration(start, null, new Date("2026-10-03T10:00:10.000Z")),
    ).toBe("10s");
  });

  it("maps states to tones", () => {
    expect(format.operationTone("finished")).toBe("good");
    expect(format.operationTone("running")).toBe("info");
    expect(format.operationTone("failed")).toBe("bad");
    expect(format.safekeeperTone("retiring")).toBe("warn");
    expect(format.availabilityTone("Offline")).toBe("bad");
    expect(format.availabilityTone(null)).toBe("neutral");
    expect(format.schedulingTone("Active")).toBe("good");
    expect(format.schedulingTone("Draining")).toBe("warn");
  });
});

describe("operation helpers", () => {
  it("marks completed, running and pending steps in worker order", () => {
    const rows = stepRows(operation());
    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ["plan", "done"],
      ["create", "done"],
      ["ready", "running"],
      ["register", "pending"],
      ["migrate", "pending"],
      ["retire", "pending"],
    ]);
    expect(rows[2]?.output).toEqual({ wait: 1 });
  });

  it("shows no running step once the operation has settled, and unknown steps after the known ones", () => {
    const rows = stepRows(
      operation({
        action: "pageservers.rebalance",
        status: "failed",
        progress: { completed_steps: ["plan", "extra"], outputs: {} },
      }),
    );
    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ["plan", "done"],
      ["execute", "pending"],
      ["extra", "done"],
    ]);
  });

  it("describes what started an operation and detects active ones", () => {
    expect(describeTrigger({ reason: "manual" })).toBe("manual");
    expect(
      describeTrigger({ reason: "pageserver-joined", nodeIds: [4, 5] }),
    ).toBe("pageserver-joined (nodes 4, 5)");
    expect(describeTrigger({})).toBe("unknown");
    expect(hasActiveOperation([operation({ status: "finished" })])).toBe(false);
    expect(hasActiveOperation([operation({ status: "scheduling" })])).toBe(
      true,
    );
  });

  it("caps long outputs", () => {
    expect(formatOutput({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatOutput("x".repeat(50), 10)).toContain("more characters");
  });
});

describe("loading for pages", () => {
  it("turns an unset token into the not-deployed message", () => {
    expect(toUnavailable(new ControlPlaneConfigError("unset"))).toMatchObject({
      status: "unavailable",
      reason: "not_configured",
      message: expect.stringContaining("probably isn't deployed yet"),
    });
  });

  it("distinguishes unreachable, rejected, missing and other failures", () => {
    expect(
      toUnavailable(new ControlPlaneUnavailableError("down", 0, "unreachable")),
    ).toMatchObject({ reason: "unreachable" });
    expect(
      toUnavailable(
        new ControlPlaneUnavailableError("no", 401, "unauthorized"),
      ),
    ).toMatchObject({ reason: "rejected" });
    expect(toUnavailable(new ControlPlaneNotFoundError("gone"))).toMatchObject({
      reason: "not_found",
    });
    expect(
      toUnavailable(new ControlPlaneUnavailableError("boom", 500, "x")),
    ).toMatchObject({ reason: "error", message: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toUnavailable(new Error("bug"))).toMatchObject({ reason: "error" });
  });

  it("returns unavailable instead of throwing when nothing is configured", async () => {
    vi.stubEnv("ALLOYDB_ADMIN_API_TOKEN", "");
    const result = await loadPlatform(async (client) => client.listNodes());
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "not_configured",
    });
    vi.unstubAllEnvs();
  });
});
