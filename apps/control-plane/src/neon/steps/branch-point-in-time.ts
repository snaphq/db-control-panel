import { NonRetryableError } from '../../operations/steps.js';
import { type StorconClient, StorconError } from '../storcon-client.js';
import type { BranchRow, ProjectRow } from '../store.js';

/**
 * Turns the `parent_timestamp` of a branch request into the LSN to fork at, by
 * asking the storage controller (`getLsnByTimestamp`). The four answers:
 *
 * - `present`: commits exist on both sides of the time; the LSN is the last
 *   commit at or before it.
 * - `future`: no commit followed the time, so the parent's data has not changed
 *   since. The API already refused times later than now, so this is an idle
 *   parent and the LSN (its last commit) is exactly the data as of that time;
 *   the pageserver itself calls it "a valid case for branch creation"
 *   (pageserver/src/pgdatadir_mapping.rs:1056-1061).
 * - `past`: the time is before the oldest history still kept (retention window
 *   or the parent's own fork point). Nothing can be restored there.
 * - `nodata`: the parent has no commit timestamps yet to compare against.
 *
 * `past` and `nodata` cannot succeed on a retry, so they fail the operation.
 */
export async function resolveTimestampLsn(input: {
  storcon: StorconClient;
  project: Pick<ProjectRow, 'tenantId' | 'historyRetentionSeconds'>;
  parent: Pick<BranchRow, 'name' | 'timelineId'>;
  timestamp: Date;
}): Promise<string> {
  const { storcon, project, parent, timestamp } = input;
  const at = timestamp.toISOString();
  let found: Awaited<ReturnType<StorconClient['getLsnByTimestamp']>>;
  try {
    found = await storcon.getLsnByTimestamp(
      project.tenantId,
      parent.timelineId,
      timestamp,
    );
  } catch (error) {
    // 400: the controller or pageserver refused the request; 404: the parent
    // timeline is not there. Neither changes on a retry.
    if (
      error instanceof StorconError &&
      (error.status === 400 || error.status === 404)
    ) {
      throw new NonRetryableError(
        `Could not resolve ${at} on branch "${parent.name}": ${error.message}`,
      );
    }
    throw error;
  }
  switch (found.kind) {
    case 'present':
    case 'future':
      return found.lsn;
    case 'past':
      throw new NonRetryableError(
        `Branch "${parent.name}" has no history at ${at}. The earliest point available is LSN ${found.lsn}, bounded by the history retention of ${project.historyRetentionSeconds} seconds and by when the branch was forked. Pick a later time.`,
      );
    case 'nodata':
      throw new NonRetryableError(
        `Branch "${parent.name}" has no committed transactions yet, so ${at} cannot be matched to a point in its history. Branch from its latest data instead.`,
      );
  }
}
