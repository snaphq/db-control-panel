import { describe, expect, it } from "vitest";
import {
  OPERATION_ACTIONS,
  PLATFORM_OPERATION_ACTIONS,
  adminNodeSchema,
  adminSafekeeperSchema,
  listPlatformOperationsQuerySchema,
  platformOperationActionSchema,
  platformOperationSchema,
} from "./index.js";

const now = "2026-10-03T10:00:00.000Z";

describe("platform operation actions", () => {
  it("never overlap the per-project actions the console labels", () => {
    for (const action of PLATFORM_OPERATION_ACTIONS) {
      expect(OPERATION_ACTIONS).not.toContain(action);
    }
  });

  it("accepts the two platform actions and nothing else", () => {
    expect(
      platformOperationActionSchema.safeParse("safekeepers.spread").success,
    ).toBe(true);
    expect(
      platformOperationActionSchema.safeParse("pageservers.rebalance").success,
    ).toBe(true);
    expect(
      platformOperationActionSchema.safeParse("project.create").success,
    ).toBe(false);
  });
});

describe("platform operations", () => {
  const operation = {
    id: "op_1",
    action: "safekeepers.spread",
    status: "running",
    failures_count: 0,
    error: null,
    params: { reason: "manual" },
    progress: { completed_steps: ["platform.spread.plan"], outputs: { a: 1 } },
    created_at: now,
    updated_at: now,
    finished_at: null,
  };

  it("carries params and step progress", () => {
    expect(platformOperationSchema.safeParse(operation).success).toBe(true);
    expect(
      platformOperationSchema.safeParse({
        ...operation,
        action: "project.create",
      }).success,
    ).toBe(false);
  });

  it("lists with scope=platform by default and caps the page size", () => {
    expect(listPlatformOperationsQuerySchema.parse({})).toMatchObject({
      scope: "platform",
      limit: 50,
    });
    expect(
      listPlatformOperationsQuerySchema.safeParse({ scope: "org" }).success,
    ).toBe(false);
    expect(
      listPlatformOperationsQuerySchema.safeParse({ limit: "101" }).success,
    ).toBe(false);
    expect(
      listPlatformOperationsQuerySchema.parse({ status: "active", limit: "5" }),
    ).toMatchObject({
      status: "active",
      limit: 5,
    });
  });
});

describe("admin nodes and safekeepers", () => {
  it("accepts a node with no pageserver and one with full state", () => {
    const node = {
      id: 1,
      name: "hel-1",
      hostname: "hel-1",
      zone: "az-1",
      tailscale_ip: "100.64.0.1",
      roles: ["pageserver"],
      ready: true,
      missing: false,
      labels: { "alloydb.net/pageserver": "true" },
      allocatable: { cpu_millis: 8000, memory_bytes: 1, storage_bytes: null },
      pageserver: null,
      safekeepers: [{ id: 1, state: "active" }],
      libsql_databases: 0,
      updated_at: now,
    };
    expect(adminNodeSchema.safeParse(node).success).toBe(true);
    expect(
      adminNodeSchema.safeParse({
        ...node,
        pageserver: {
          registered: true,
          availability: "Active",
          scheduling: "Active",
          attached_shards: 3,
          observed_at: now,
        },
      }).success,
    ).toBe(true);
    expect(
      adminNodeSchema.safeParse({
        ...node,
        safekeepers: [{ id: 1, state: "gone" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a retiring safekeeper with drain progress", () => {
    expect(
      adminSafekeeperSchema.safeParse({
        id: 3,
        node_id: 1,
        node_name: "hel-1",
        availability_zone: "az-3",
        hostname: "safekeeper-3.neon.svc.cluster.local",
        state: "retiring",
        operation_id: "op_1",
        drain: { total: 4, migrated: 1, failed: [], updated_at: now },
        created_at: now,
        updated_at: now,
        retired_at: null,
      }).success,
    ).toBe(true);
  });
});
