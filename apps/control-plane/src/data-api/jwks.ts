import type { Jwks } from '@repo/control-plane-contract';
import type { ProjectRow } from '../neon/store.js';

/**
 * Which keys PostgREST trusts for a project: the ones the project brought, or
 * else the platform-issued key created when the Data API was first enabled.
 */

export function effectiveJwks(
  project: Pick<ProjectRow, 'dataApiJwks' | 'dataApiCustomJwks'>,
): Jwks | null {
  return (project.dataApiCustomJwks ?? project.dataApiJwks) as Jwks | null;
}

export function jwksSource(
  project: Pick<ProjectRow, 'dataApiJwks' | 'dataApiCustomJwks'>,
): 'platform' | 'custom' | null {
  if (project.dataApiCustomJwks) return 'custom';
  return project.dataApiJwks ? 'platform' : null;
}
