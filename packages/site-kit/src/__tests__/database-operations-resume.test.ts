import { OPERATION_ACTIONS } from "@repo/control-plane-contract";
import { databasesApi } from "@repo/react-ui/components/databases/api";
import { describeOperation } from "@repo/react-ui/components/databases/operation-labels";
import {
  type TrackedOperation,
  mergeResumed,
} from "@repo/react-ui/components/databases/use-operation-tracker";
import { afterEach, describe, expect, it, vi } from "vitest";

const operation = (id: string, status: "scheduling" | "running" = "running") =>
  ({
    id,
    target_type: "branch",
    target_id: "br_1",
    action: "branch.create",
    status,
    failures_count: 0,
    error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    finished_at: null,
  }) as const;

describe("operation labels", () => {
  it("describe every action the control plane can report", () => {
    for (const action of OPERATION_ACTIONS) {
      expect(describeOperation({ action }).length).toBeGreaterThan(0);
    }
  });
});

describe("mergeResumed", () => {
  const tracked: TrackedOperation = {
    id: "op_1",
    label: "Creating branch dev",
    status: "running",
    error: null,
  };

  it("adds operations found after a reload with a generic label and their status", () => {
    const merged = mergeResumed([], [operation("op_7", "scheduling")]);
    expect(merged).toEqual([
      {
        id: "op_7",
        label: "Creating a branch",
        status: "scheduling",
        error: null,
      },
    ]);
  });

  it("keeps the label and status of an operation this page already follows", () => {
    const current = [{ ...tracked, status: "finished" as const }];
    expect(mergeResumed(current, [operation("op_1")])).toBe(current);
  });

  it("puts resumed operations after the ones started on this page", () => {
    const merged = mergeResumed(
      [tracked],
      [operation("op_1"), operation("op_2")],
    );
    expect(merged.map((op) => op.id)).toEqual(["op_1", "op_2"]);
  });
});

describe("databasesApi.activeOperations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the console route for active operations of this project", async () => {
    const page = { operations: [operation("op_1")], next_cursor: null };
    const fetchMock = vi.fn(async () => Response.json(page));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      databasesApi("console project").activeOperations(),
    ).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/console%20project/operations?status=active",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("surfaces the server's message when the call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Not available", code: "unavailable" },
          { status: 502 },
        ),
      ),
    );
    await expect(databasesApi("p").activeOperations()).rejects.toMatchObject({
      status: 502,
      message: "Not available",
    });
  });
});
