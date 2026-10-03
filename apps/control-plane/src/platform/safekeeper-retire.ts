import { type PlatformDeps, workloadFor } from './deps.js';
import type { SafekeeperRow } from './store.js';

/**
 * Takes a safekeeper out of service for good: no new timelines (storage
 * controller policy `Decomissioned`, SkSchedulingPolicy in
 * libs/pageserver_api/src/controller_api.rs:436-442), then its StatefulSet,
 * Service and volume are deleted and the row is marked retired. The controller
 * has no call that deletes a safekeeper record (the routes at http.rs:2420-2445
 * are list, get, upsert and policy), so the `Decomissioned` record stays; it is
 * not heart-beaten (heartbeater.rs:329) and cannot be a migration target
 * (safekeeper_service.rs:1192-1202).
 *
 * Every step is repeatable, so a retry after a crash finishes the job. Callers
 * make sure the safekeeper holds no timelines first.
 */
export async function retireSafekeeper(
  deps: PlatformDeps,
  row: SafekeeperRow,
): Promise<void> {
  const known = (await deps.storcon.listSafekeepers()).some(
    (sk) => sk.id === row.id,
  );
  if (known) {
    await deps.storcon.setSafekeeperSchedulingPolicy(row.id, 'Decomissioned');
  }
  await deps.kube.remove(row.id);
  await deps.platform.setSafekeeperState(row.id, 'retired');
  deps.logger.info(`safekeeper ${row.id} retired`);
}

/** True when every active safekeeper's pod is Ready, so one may be disturbed. */
export async function allActiveReady(
  deps: PlatformDeps,
  rows: SafekeeperRow[],
): Promise<{ ready: boolean; notReady: number[] }> {
  const notReady: number[] = [];
  for (const row of rows.filter((r) => r.state === 'active')) {
    const status = await deps.kube.status(workloadFor(deps, row));
    if (!status.ready) notReady.push(row.id);
  }
  return { ready: notReady.length === 0, notReady };
}
