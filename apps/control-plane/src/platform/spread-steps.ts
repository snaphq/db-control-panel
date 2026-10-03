import { registerSafekeepers } from '../neon/registration.js';
import { NonRetryableError, type StepDefinition } from '../operations/steps.js';
import { type PlatformDeps, workloadFor } from './deps.js';
import { retireSafekeeper } from './safekeeper-retire.js';
import { drainSafekeeper } from './spread-migrate.js';
import { type SpreadPlan, planSpread } from './spread-plan.js';
import type { SafekeeperRow } from './store.js';

/**
 * Plan of `safekeepers.spread`: replace one safekeeper by a new one on another
 * node, following the layout policy (layout.ts). The steps are repeatable and
 * the operation resumes after the last finished one:
 *
 *   plan      decide the move (or that nothing is needed)
 *   create    new safekeeper row, StatefulSet and Service on the target node
 *   ready     wait for its pod to be Ready
 *   register  register it with the storage controller and make it Active
 *   migrate   move every timeline off the old safekeeper (RFC-035 membership change)
 *   retire    wait until the old one is empty, decommission it, delete its objects
 */

const PLAN = 'platform.spread.plan';
const CREATE = 'platform.spread.create';

interface MovePlan {
  oldId: number;
  newId: number | null;
  toNodeId: number;
  toNodeName: string;
}

const skipped = { skipped: true } as const;

function movePlan(outputs: Readonly<Record<string, unknown>>): MovePlan | null {
  return (outputs[PLAN] as SpreadPlan | undefined)?.move ?? null;
}

/** The replacement's id: planned up front when it exists, else made by `create`. */
function newIdOf(outputs: Readonly<Record<string, unknown>>): number {
  const move = movePlan(outputs);
  const created = (outputs[CREATE] as { newId?: number } | undefined)?.newId;
  const id = move?.newId ?? created;
  if (id === undefined) {
    throw new NonRetryableError(
      'The spread plan has no replacement safekeeper',
    );
  }
  return id;
}

async function mustGet(deps: PlatformDeps, id: number): Promise<SafekeeperRow> {
  const row = await deps.platform.getSafekeeper(id);
  if (!row) throw new NonRetryableError(`Safekeeper ${id} no longer exists`);
  return row;
}

export function spreadSteps(deps: PlatformDeps): StepDefinition[] {
  const { platform, kube, storcon, config } = deps;

  return [
    {
      name: PLAN,
      async run({ operation }) {
        return planSpread(deps, operation.id);
      },
    },

    {
      name: CREATE,
      async run({ operation, outputs }) {
        const move = movePlan(outputs);
        if (!move) return skipped;
        // A crash after the insert must not insert a second row on the retry.
        const row =
          move.newId !== null
            ? await mustGet(deps, move.newId)
            : ((await platform.listSafekeepers()).find(
                (r) => r.operationId === operation.id,
              ) ??
              (await platform.createSafekeeper({
                nodeId: move.toNodeId,
                nodeName: move.toNodeName,
                operationId: operation.id,
              })));
        await kube.ensure(workloadFor(deps, row));
        return { newId: row.id };
      },
    },

    {
      name: 'platform.spread.ready',
      async run({ outputs }) {
        if (!movePlan(outputs)) return skipped;
        const row = await mustGet(deps, newIdOf(outputs));
        const workload = workloadFor(deps, row);
        const deadline = deps.now() + config.waitTimeoutMs;
        while (true) {
          // Also recreates objects someone deleted while the operation waited.
          await kube.ensure(workload);
          if ((await kube.status(workload)).ready) return { ready: true };
          if (deps.now() >= deadline) {
            throw new Error(
              `Safekeeper ${row.id} on ${row.nodeName} is not Ready after ${Math.round(config.waitTimeoutMs / 1000)}s (pod pending or image pulling); the step retries`,
            );
          }
          await deps.sleep(config.pollIntervalMs);
        }
      },
    },

    {
      name: 'platform.spread.register',
      async run({ outputs }) {
        if (!movePlan(outputs)) return skipped;
        const id = newIdOf(outputs);
        // POST /control/v1/safekeeper/:id, then scheduling policy Active
        // (neon/registration.ts); safe to repeat.
        await registerSafekeepers(storcon, [id]);
        await platform.setSafekeeperState(id, 'active');
        return { registered: id };
      },
    },

    {
      name: 'platform.spread.migrate',
      async run({ outputs, resume, checkpoint }) {
        const move = movePlan(outputs);
        if (!move) return skipped;
        const newId = newIdOf(outputs);
        const old = await mustGet(deps, move.oldId);
        // The old safekeeper stays Active in the controller until it is empty;
        // `retiring` only tells the planner and the manager it is leaving.
        if (old.state !== 'retiring') {
          await platform.setSafekeeperState(old.id, 'retiring');
        }
        const rows = await platform.listSafekeepers();
        const candidates = [
          newId,
          ...rows
            .filter(
              (r) => r.state === 'active' && r.id !== old.id && r.id !== newId,
            )
            .map((r) => r.id),
        ];
        const previous =
          (resume as { migrated?: number } | undefined)?.migrated ?? 0;
        const drain = await drainSafekeeper(
          deps,
          { oldId: old.id, candidates, previouslyMigrated: previous },
          async (progress) => {
            await platform.setSafekeeperDrain(old.id, {
              total: progress.total,
              migrated: progress.migrated,
              failed: progress.failed,
              updatedAt: new Date().toISOString(),
            });
            await checkpoint({
              migrated: progress.migrated,
              passes: progress.passes,
            });
          },
        );
        if (drain.failed.length > 0) {
          const first = drain.failed[0];
          throw new Error(
            `${drain.failed.length} timeline(s) could not be moved off safekeeper ${old.id}; each was aborted and left on its committed set. First: ${first?.timeline}: ${first?.reason}`,
          );
        }
        return { migrated: drain.migrated, unmanaged: drain.unmanaged };
      },
    },

    {
      name: 'platform.spread.retire',
      async run({ outputs }) {
        const move = movePlan(outputs);
        if (!move) return skipped;
        const old = await mustGet(deps, move.oldId);
        if (old.state === 'retired') return { retired: old.id };
        const others = (await platform.listSafekeepers()).filter(
          (r) => r.state === 'active' && r.id !== old.id,
        );
        if (others.length < config.safekeeperCount) {
          throw new NonRetryableError(
            `Refusing to retire safekeeper ${old.id}: only ${others.length} other active safekeeper(s), ${config.safekeeperCount} are wanted`,
          );
        }
        await waitUntilEmpty(deps, old.id);
        // Stop new timelines landing on it, then look once more: one created
        // between the last listing and the policy change would be lost.
        await storcon.setSafekeeperSchedulingPolicy(old.id, 'Decomissioned');
        const stragglers = await deps.safekeepers.listTimelines(old.id);
        if (stragglers.length > 0) {
          await storcon.setSafekeeperSchedulingPolicy(old.id, 'Active');
          throw new Error(
            `Safekeeper ${old.id} gained ${stragglers.length} timeline(s) while it was being retired; the operation retries the move`,
          );
        }
        await retireSafekeeper(deps, old);
        return { retired: old.id };
      },
    },
  ];
}

/**
 * Waits for the storage controller's exclusion of the safekeeper from the
 * timelines it left (the final step of a membership change deletes the local
 * copy, safekeeper/src/timelines_global_map.rs:538-620). Anything left after the
 * wait is either not managed by the controller or stuck; both need a person.
 */
async function waitUntilEmpty(deps: PlatformDeps, id: number): Promise<void> {
  const deadline = deps.now() + deps.config.waitTimeoutMs;
  while (true) {
    const left = await deps.safekeepers.listTimelines(id);
    if (left.length === 0) return;
    if (deps.now() >= deadline) {
      const sample = left
        .slice(0, 3)
        .map((t) => `${t.tenantId}/${t.timelineId}`)
        .join(', ');
      throw new Error(
        `Safekeeper ${id} still holds ${left.length} timeline(s) (${sample}); not decommissioning it. Timelines the controller does not manage must be removed by hand (docs-internal/platform/control-plane.mdx)`,
      );
    }
    await deps.sleep(deps.config.pollIntervalMs);
  }
}
