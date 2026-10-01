import type { ComputeCtlClient } from './compute-ctl-client.js';
import type { ComputeRuntime } from './compute-runtime.js';
import type { NeonStore } from './store.js';

/**
 * Suspends computes nobody has used for `suspend_timeout_seconds`. Activity is
 * read from compute_ctl's `/status` (`last_active`) and combined with the time
 * the control plane itself last woke or touched the endpoint, so a connection the
 * proxy just opened is not undone by a stale `last_active`.
 */

/** A compute that fails this many checks in a row is presumed dead and cleaned up. */
const UNREACHABLE_LIMIT = 3;

interface SweepResult {
  checked: number;
  suspended: string[];
  failed: string[];
}

interface IdleSweeperDeps {
  store: NeonStore;
  computeCtl: ComputeCtlClient;
  runtime: ComputeRuntime;
  now?: () => Date;
  logger?: { warn(message: string): void };
}

export interface IdleSweeper {
  sweep(): Promise<SweepResult>;
}

export function createIdleSweeper(deps: IdleSweeperDeps): IdleSweeper {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? console;
  const unreachable = new Map<string, number>();

  const describe = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  return {
    async sweep() {
      const result: SweepResult = { checked: 0, suspended: [], failed: [] };
      const running = await deps.store.listEndpointsInState(['running']);
      const seen = new Set<string>();
      for (const endpoint of running) {
        seen.add(endpoint.id);
        if (!endpoint.podIp) continue;
        result.checked += 1;
        try {
          let stop = false;
          try {
            const report = await deps.computeCtl.status(
              endpoint.podIp,
              endpoint.id,
            );
            unreachable.delete(endpoint.id);
            if (report.status === 'failed' || report.status === 'terminated') {
              stop = true;
            } else if (report.status === 'running') {
              const activity = [report.lastActive, endpoint.lastActiveAt]
                .filter((d): d is Date => d !== null)
                .sort((a, b) => b.getTime() - a.getTime())[0];
              if (
                report.lastActive &&
                (!endpoint.lastActiveAt ||
                  report.lastActive > endpoint.lastActiveAt)
              ) {
                // Keep the stored value current for the API and for the next sweep.
                await deps.store.touchEndpoint(endpoint.id, report.lastActive);
              }
              // 0 means never suspend.
              const limitMs = endpoint.suspendTimeoutSeconds * 1000;
              stop =
                limitMs > 0 &&
                activity !== undefined &&
                now().getTime() - activity.getTime() > limitMs;
            }
          } catch (error) {
            const misses = (unreachable.get(endpoint.id) ?? 0) + 1;
            unreachable.set(endpoint.id, misses);
            logger.warn(
              `status of ${endpoint.id} failed (${misses}): ${describe(error)}`,
            );
            stop = misses >= UNREACHABLE_LIMIT;
          }
          if (stop) {
            await deps.runtime.suspend(endpoint.id);
            unreachable.delete(endpoint.id);
            result.suspended.push(endpoint.id);
          }
        } catch (error) {
          logger.warn(`sweeping ${endpoint.id} failed: ${describe(error)}`);
          result.failed.push(endpoint.id);
        }
      }
      for (const id of unreachable.keys())
        if (!seen.has(id)) unreachable.delete(id);
      return result;
    },
  };
}
