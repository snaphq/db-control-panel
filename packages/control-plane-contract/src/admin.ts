import { z } from "zod";

/**
 * Platform-wide operations. They are not scoped to an organization or console
 * project and take their own lock (one at a time), not a project's. They are
 * kept apart from `OPERATION_ACTIONS` so the console's per-project labels and
 * tables never meet them.
 */
export const PLATFORM_OPERATION_ACTIONS = [
  "pageservers.rebalance",
  "safekeepers.spread",
] as const;
export const platformOperationActionSchema = z.enum(PLATFORM_OPERATION_ACTIONS);
export type PlatformOperationAction = z.infer<
  typeof platformOperationActionSchema
>;
