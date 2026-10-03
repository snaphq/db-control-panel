import { parseQuantity } from '../libsql/nodes-sync.js';
import { registerSafekeepers } from '../neon/registration.js';
import { readClusterNodes } from './cluster.js';
import { type PlatformDeps, workloadFor } from './deps.js';
import { planSafekeeperLayout } from './layout.js';
import { PlatformBusyError, type SafekeeperRow } from './store.js';

export interface ManagerOptions {
  /** Start `safekeepers.spread` by itself when the layout is off. */
  autoSpread: boolean;
  /** After a failed spread, wait this long before starting another by itself. */
  failureCooldownMs: number;
}

export interface ManagerResult {
  /** Why nothing could be done, or a note for the log; null when all is well. */
  note: string | null;
  created: number[];
  registered: number[];
  /** The safekeeper whose StatefulSet was replaced to roll out a new image. */
  updated: number | null;
  /** The spread operation started by this pass. */
  spreadOperation: string | null;
}

const NOTHING: ManagerResult = {
  note: null,
  created: [],
  registered: [],
  updated: null,
  spreadOperation: null,
};

/**
 * The worker's periodic pass over the safekeepers the control plane runs. It is
 * what makes a fresh cluster usable before any project exists, and it keeps the
 * fleet healthy afterwards:
 *
 * 1. starts missing safekeepers (all of them on a fresh cluster, one after a
 *    loss) on the nodes the layout policy picks;
 * 2. makes sure every safekeeper's StatefulSet and Service exist, registers the
 *    ones whose pod is Ready with the storage controller and keeps them
 *    registered;
 * 3. rolls out a changed image one safekeeper at a time, and only while every
 *    other one is Ready (what the PodDisruptionBudget `maxUnavailable: 1`
 *    allows for voluntary disruption, kept here in code because the worker, not
 *    a rollout, owns the StatefulSets);
 * 4. starts a `safekeepers.spread` operation when the layout is off.
 *
 * Idempotent, and skipped while a spread runs so it never races the spread's
 * own state changes.
 */
export async function reconcileSafekeepers(
  deps: PlatformDeps,
  options: ManagerOptions,
): Promise<ManagerResult> {
  const { platform, kube, config } = deps;
  // A spread changes the rows and objects this pass looks after; a rebalance
  // does not, so a long one must not stop the safekeepers being looked after.
  const spread = await platform.latestOperation('safekeepers.spread');
  if (
    spread &&
    (spread.status === 'scheduling' || spread.status === 'running')
  ) {
    return { ...NOTHING, note: 'a safekeepers.spread operation is running' };
  }

  let rows = await platform.listSafekeepers();
  const live = () =>
    rows.filter((r) => r.state === 'creating' || r.state === 'active');
  const volumeBytes = parseQuantity(config.safekeeperStorage) ?? 0;
  const cluster = readClusterNodes(
    await deps.neon.listNodes(),
    live(),
    volumeBytes,
  );
  const layout = planSafekeeperLayout({
    nodes: cluster.nodes,
    safekeepers: live().map((r) => ({ id: r.id, nodeId: r.nodeId })),
    count: config.safekeeperCount,
  });

  const result: ManagerResult = { ...NOTHING, created: [], registered: [] };
  for (const nodeId of layout.create) {
    const nodeName = cluster.hostnames.get(nodeId);
    if (!nodeName) continue;
    const row = await platform.createSafekeeper({
      nodeId,
      nodeName,
      operationId: null,
    });
    result.created.push(row.id);
  }
  if (result.created.length > 0) rows = await platform.listSafekeepers();
  if (layout.blocked && result.created.length === 0)
    result.note = layout.blocked;

  // Bring every live safekeeper's objects and registration in line.
  const ready: SafekeeperRow[] = [];
  const drifted: SafekeeperRow[] = [];
  for (const row of live()) {
    const workload = workloadFor(deps, row);
    let status = await kube.status(workload);
    if (!status.exists) {
      // Never created, or deleted by hand: the volume survives a deleted
      // StatefulSet, so recreating it brings the same data back.
      await kube.ensure(workload);
      status = await kube.status(workload);
    }
    if (status.ready) {
      ready.push(row);
      if (!status.current) drifted.push(row);
    }
  }
  const registrable = ready.map((r) => r.id);
  if (registrable.length > 0) {
    await registerSafekeepers(deps.storcon, registrable);
    for (const row of ready.filter((r) => r.state === 'creating')) {
      await platform.setSafekeeperState(row.id, 'active');
      result.registered.push(row.id);
    }
  }

  // Roll out a new image: one safekeeper per pass, never while another is down.
  const active = live();
  const [next] = drifted.sort((a, b) => a.id - b.id);
  if (next && ready.length === active.length) {
    await kube.update(workloadFor(deps, next));
    result.updated = next.id;
    deps.logger.info(`rolling safekeeper ${next.id} to ${config.neonImage}`);
  }

  const healthy = ready.length === active.length;
  if (options.autoSpread && result.created.length === 0 && healthy) {
    result.spreadOperation = await maybeStartSpread(
      deps,
      options,
      rows,
      layout.move !== null,
    );
  }
  return result;
}

async function maybeStartSpread(
  deps: PlatformDeps,
  options: ManagerOptions,
  rows: SafekeeperRow[],
  layoutIsOff: boolean,
): Promise<string | null> {
  const unfinished = rows.some((r) => r.state === 'retiring');
  if (!(layoutIsOff || unfinished)) return null;
  const last = await deps.platform.latestOperation('safekeepers.spread');
  if (
    last?.status === 'failed' &&
    last.finishedAt !== null &&
    deps.now() - last.finishedAt.getTime() < options.failureCooldownMs
  ) {
    return null;
  }
  try {
    const started = await deps.platform.createOperation({
      action: 'safekeepers.spread',
      params: { reason: unfinished ? 'resume' : 'layout' },
    });
    deps.logger.info(`started safekeepers.spread ${started.id}`);
    return started.id;
  } catch (error) {
    if (error instanceof PlatformBusyError) return null;
    throw error;
  }
}
