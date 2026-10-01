/**
 * @repo/durable-exec
 * Main entry: exports the Inngest client and event types for consumers
 * (e.g. server actions that call inngest.send()).
 */

export { inngest } from "./client";
export type { DurableEvents } from "./events";
export { allFunctions } from "./functions";
