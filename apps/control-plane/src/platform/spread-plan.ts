import { parseQuantity } from '../libsql/nodes-sync.js';
import { readClusterNodes } from './cluster.js';
import type { PlatformDeps } from './deps.js';
import { planSafekeeperLayout } from './layout.js';
import { allActiveReady, retireSafekeeper } from './safekeeper-retire.js';
import type { SafekeeperRow } from './store.js';

/** What the `plan` step decided; later steps read it from the operation's outputs. */
export interface SpreadPlan {
  /** The one safekeeper to replace, or null when there is nothing to do now. */
  move: {
    oldId: number;
    /** The replacement when it already exists (a resumed or surplus case), else null until `create`. */
    newId: number | null;
    toNodeId: number;
    toNodeName: string;
    reason: 'layout' | 'resume' | 'surplus';
  } | null;
  /** Why no move was planned, for the operation's output. */
  note: string | null;
}

const idle = (note: string): SpreadPlan => ({ move: null, note });

/**
 * Chooses which safekeeper to drop when more than the wanted number are live:
 * the one whose removal leaves the best layout, the newest of equals. That is
 * the old safekeeper of an interrupted move, since its replacement already sits
 * where the policy wants it.
 */
function surplusVictim(
  live: SafekeeperRow[],
  nodes: ReturnType<typeof readClusterNodes>['nodes'],
  count: number,
): SafekeeperRow | undefined {
  const scored = live.map((candidate) => {
    const rest = live.filter((row) => row.id !== candidate.id);
    const plan = planSafekeeperLayout({
      nodes,
      safekeepers: rest.map((row) => ({ id: row.id, nodeId: row.nodeId })),
      count,
    });
    return { candidate, work: plan.create.length + (plan.move ? 1 : 0) };
  });
  return scored.sort(
    (a, b) => a.work - b.work || b.candidate.id - a.candidate.id,
  )[0]?.candidate;
}

/**
 * Plans one safekeeper replacement. Never plans two: a spread operation moves
 * one safekeeper and the next run (manual, or the worker's loop) moves the next,
 * so at most one timeline quorum member is in flight at any time.
 */
export async function planSpread(
  deps: PlatformDeps,
  operationId: string,
): Promise<SpreadPlan> {
  const { config } = deps;
  let rows = await deps.platform.listSafekeepers();

  // A safekeeper created by an earlier operation that never got registered
  // holds nothing; remove it so it does not distort the layout.
  for (const row of rows) {
    if (
      row.state === 'creating' &&
      row.operationId !== null &&
      row.operationId !== operationId
    ) {
      deps.logger.warn(`removing abandoned safekeeper ${row.id}`);
      await retireSafekeeper(deps, row);
    }
  }
  rows = await deps.platform.listSafekeepers();

  const live = rows.filter(
    (r) => r.state === 'creating' || r.state === 'active',
  );
  const volumeBytes = parseQuantity(config.safekeeperStorage) ?? 0;
  const cluster = readClusterNodes(
    await deps.neon.listNodes(),
    live,
    volumeBytes,
  );
  const newest = (excluding?: number) =>
    live
      .filter((r) => r.state === 'active' && r.id !== excluding)
      .sort((a, b) => b.id - a.id)[0];

  // An earlier attempt moved timelines but did not finish: carry on with it.
  const retiring = rows.find((r) => r.state === 'retiring');
  if (retiring) {
    const replacement = newest();
    if (!replacement)
      return idle(
        `safekeeper ${retiring.id} is retiring but no active safekeeper can take over`,
      );
    return {
      move: {
        oldId: retiring.id,
        newId: replacement.id,
        toNodeId: replacement.nodeId,
        toNodeName: replacement.nodeName,
        reason: 'resume',
      },
      note: null,
    };
  }

  if (live.some((r) => r.state === 'creating')) {
    return idle('safekeepers are still starting');
  }
  const health = await allActiveReady(deps, live);
  if (!health.ready) {
    return idle(
      `safekeeper ${health.notReady.join(', ')} is not Ready; not moving another`,
    );
  }

  if (live.length > config.safekeeperCount) {
    const victim = surplusVictim(live, cluster.nodes, config.safekeeperCount);
    const keeper = newest(victim?.id);
    if (!victim || !keeper) return idle('no safekeeper can be removed');
    return {
      move: {
        oldId: victim.id,
        newId: keeper.id,
        toNodeId: keeper.nodeId,
        toNodeName: keeper.nodeName,
        reason: 'surplus',
      },
      note: null,
    };
  }

  const layout = planSafekeeperLayout({
    nodes: cluster.nodes,
    safekeepers: live.map((r) => ({ id: r.id, nodeId: r.nodeId })),
    count: config.safekeeperCount,
  });
  if (layout.blocked) return idle(layout.blocked);
  if (layout.create.length > 0) {
    return idle(
      `${layout.create.length} safekeeper(s) are missing; the worker starts them`,
    );
  }
  if (!layout.move)
    return idle(
      'the safekeepers are already spread as wide as the nodes allow',
    );
  const toNodeName = cluster.hostnames.get(layout.move.toNodeId);
  if (!toNodeName) return idle(`node ${layout.move.toNodeId} has no hostname`);
  return {
    move: {
      oldId: layout.move.remove,
      newId: null,
      toNodeId: layout.move.toNodeId,
      toNodeName,
      reason: 'layout',
    },
    note: null,
  };
}
