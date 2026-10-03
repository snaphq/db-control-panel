import { describe, expect, it } from "vitest";
import {
  OPERATION_ACTIONS,
  PLATFORM_OPERATION_ACTIONS,
  platformOperationActionSchema,
} from "./index.js";

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
