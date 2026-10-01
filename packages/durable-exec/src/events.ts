/**
 * Typed Inngest event registry for @repo/durable-exec.
 * All event names and their data shapes are declared here so callers get
 * compile-time safety when doing `inngest.send(...)`.
 */

export type DurableEvents = {
  /** Daily trial/subscription expiration → readonly workspaces */
  "cron/billing-trial-expiration": {
    data: Record<string, never>;
  };
  /** Daily cleanup of stale pending workspaces */
  "cron/billing-cleanup-pending": {
    data: Record<string, never>;
  };
};
