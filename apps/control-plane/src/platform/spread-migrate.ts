import { StorconError } from '../neon/storcon-http.js';
import type { PlatformDeps } from './deps.js';
import type { SafekeeperTimeline } from './safekeeper-client.js';

const ATTEMPTS = 3;
/** Passes over the safekeeper's timeline list; each pass re-reads it, so stragglers are caught. */
const MAX_PASSES = 4;

type TimelineOutcome =
  | { kind: 'moved' }
  /** Not on the safekeeper any more (the listing was stale), or the timeline is gone. */
  | { kind: 'already' }
  /** The storage controller does not manage it, so it cannot be migrated. */
  | { kind: 'unmanaged' }
  | { kind: 'failed'; reason: string };

export interface DrainProgress {
  total: number;
  migrated: number;
  failed: { timeline: string; reason: string }[];
  /** `<tenant>/<timeline>` still on the safekeeper that the controller does not manage. */
  unmanaged: string[];
  passes: number;
}

const key = (t: SafekeeperTimeline) => `${t.tenantId}/${t.timelineId}`;
const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Runs `work` over `items` with at most `limit` in flight. */
async function pool<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  return results;
}

/**
 * Replaces `oldId` by one of `candidates` in one timeline's safekeeper set.
 *
 * The set to migrate to is the current set minus the old safekeeper plus the
 * first candidate that is not already a member. `safekeeper_migrate` is
 * synchronous and resumable (storage_controller/src/service/safekeeper_service.rs
 * :1127-1426): a call that fails midway is repeated with the same set and
 * carries on (:1202-1217). A different set while one is pending is 409, and the
 * pending change is cancelled with `safekeeper_migrate_abort` (:1628-1737)
 * before asking for ours. When the attempts run out the pending change is
 * aborted too, so the timeline is left on a committed set, never half-way.
 */
async function moveTimeline(
  deps: PlatformDeps,
  timeline: SafekeeperTimeline,
  oldId: number,
  candidates: number[],
): Promise<TimelineOutcome> {
  const { admin } = deps;
  const { tenantId, timelineId } = timeline;
  const locate = () => admin.locateTimeline(tenantId, timelineId);
  // A previous attempt got as far as the joint set: complete it as it was.
  const finishPending = async (pending: number[]): Promise<TimelineOutcome> => {
    await admin.migrateTimeline(tenantId, timelineId, pending);
    return { kind: 'moved' };
  };

  let lastReason = 'no attempt made';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const location = await locate();
      if (!location) return { kind: 'unmanaged' };
      const pending = location.new_sk_set ?? null;
      if (!location.sk_set.includes(oldId) && !pending?.includes(oldId)) {
        return pending ? await finishPending(pending) : { kind: 'already' };
      }
      const replacement = candidates.find(
        (id) => !location.sk_set.includes(id),
      );
      if (replacement === undefined) {
        return {
          kind: 'failed',
          reason: 'no other safekeeper can take its place',
        };
      }
      const want = [
        ...location.sk_set.filter((id) => id !== oldId),
        replacement,
      ];
      if (pending && !sameSet(pending, want)) {
        await admin.abortTimelineMigration(tenantId, timelineId);
      }
      await admin.migrateTimeline(tenantId, timelineId, want);
      return { kind: 'moved' };
    } catch (error) {
      if (error instanceof StorconError && error.status === 404) {
        return { kind: 'already' };
      }
      lastReason = reasonOf(error);
      deps.logger.warn(
        `moving ${tenantId}/${timelineId} off safekeeper ${oldId}, attempt ${attempt}: ${lastReason}`,
      );
      if (error instanceof StorconError && error.status === 409) {
        await admin
          .abortTimelineMigration(tenantId, timelineId)
          .catch(() => {});
      }
      if (attempt < ATTEMPTS) await deps.sleep(2_000 * attempt);
    }
  }
  // Leave the timeline on a committed set rather than mid-migration.
  await admin.abortTimelineMigration(tenantId, timelineId).catch(() => {});
  return { kind: 'failed', reason: lastReason };
}

/**
 * Moves every timeline off `oldId`. Re-reads the safekeeper's own list after
 * each pass until it is empty (or only unmanaged timelines remain), and reports
 * progress through `onProgress` so a long drain is visible while it runs.
 */
export async function drainSafekeeper(
  deps: PlatformDeps,
  input: { oldId: number; candidates: number[]; previouslyMigrated: number },
  onProgress: (progress: DrainProgress) => Promise<void>,
): Promise<DrainProgress> {
  const counted = new Set<string>();
  const progress: DrainProgress = {
    total: 0,
    migrated: input.previouslyMigrated,
    failed: [],
    unmanaged: [],
    passes: 0,
  };
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    progress.passes = pass;
    const listed = await deps.safekeepers.listTimelines(input.oldId);
    const unmanaged = new Set(progress.unmanaged);
    const todo = listed.filter((t) => !unmanaged.has(key(t)));
    if (todo.length === 0) break;
    progress.total = Math.max(progress.total, progress.migrated + todo.length);
    progress.failed = [];

    const outcomes = await pool(
      todo,
      deps.config.migrateConcurrency,
      async (t) => ({
        timeline: key(t),
        outcome: await moveTimeline(deps, t, input.oldId, input.candidates),
      }),
    );
    let moved = 0;
    for (const { timeline, outcome } of outcomes) {
      if (outcome.kind === 'moved') moved += 1;
      if (outcome.kind === 'moved' || outcome.kind === 'already') {
        if (!counted.has(timeline)) progress.migrated += 1;
        counted.add(timeline);
      } else if (outcome.kind === 'unmanaged') {
        progress.unmanaged.push(timeline);
      } else {
        progress.failed.push({ timeline, reason: outcome.reason });
      }
    }
    await onProgress(progress);
    // Stop on a failure, or when the list only holds timelines that are already
    // moved and waiting to be excluded from this safekeeper.
    if (progress.failed.length > 0 || moved === 0) break;
  }
  return progress;
}
