import { type SecretBox, sealContext } from '../crypto/secretbox.js';
import type { PostgrestSidecar } from '../neon/compute-pod.js';
import type { EndpointContext, NeonStore } from '../neon/store.js';
import { effectiveJwks } from './jwks.js';

/**
 * The PostgREST containers an endpoint's pod runs: one per database of its
 * branch that has the Data API enabled. This is the `sidecars` hook of the
 * compute runtime, so a cold start (the gateway's, the proxy's or the worker's)
 * always builds the pod from the current database state.
 *
 * Each sidecar logs in as `authenticator` on 127.0.0.1:5432, straight to
 * Postgres rather than PgBouncer: PostgREST needs LISTEN for `NOTIFY pgrst`
 * (v16.4 docs/references/configuration.rst, db-channel-enabled).
 */

const POSTGRES_HOST = '127.0.0.1';
const POSTGRES_PORT = 5432;

export function createSidecarProvider(deps: {
  store: Pick<NeonStore, 'listBranchDatabases'>;
  secrets: SecretBox;
  logger?: { warn(message: string): void };
}): (context: EndpointContext) => Promise<PostgrestSidecar[]> {
  const logger = deps.logger ?? console;
  return async ({ branch, project, endpoint }) => {
    const enabled = (await deps.store.listBranchDatabases(branch.id))
      .filter((d) => d.dataApiEnabled && d.dataApiIndex !== null)
      .sort((a, b) => (a.dataApiIndex ?? 0) - (b.dataApiIndex ?? 0));
    if (enabled.length === 0) return [];

    const jwks = effectiveJwks(project);
    if (!branch.authenticatorPasswordEnc || !jwks) {
      // Starting without them is better than not starting: the database stays
      // reachable over SQL while the Data API reports itself unavailable.
      logger.warn(
        `endpoint ${endpoint.id}: Data API is enabled but the ${
          branch.authenticatorPasswordEnc ? 'JWKS' : 'authenticator password'
        } is missing; starting without PostgREST`,
      );
      return [];
    }
    const password = deps.secrets.open(
      branch.authenticatorPasswordEnc,
      sealContext.authenticatorPassword,
    );
    const jwtSecret = JSON.stringify(jwks);
    return enabled.map((db) => ({
      database: db.name,
      index: db.dataApiIndex as number,
      dbUri: `postgres://authenticator:${encodeURIComponent(password)}@${POSTGRES_HOST}:${POSTGRES_PORT}/${encodeURIComponent(db.name)}`,
      jwtSecret,
    }));
  };
}
