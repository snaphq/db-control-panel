import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Config } from '../config.js';
import {
  type DatabaseHandle,
  createDatabase,
  pingDatabase,
} from '../db/client.js';
import { isUniqueViolation } from '../operations/idempotency.js';
import { ProjectBusyError } from '../operations/repository.js';
import type { RunningMode } from './types.js';

const READY_TIMEOUT_MS = 2_000;
const FORCE_CLOSE_AFTER_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** App with `/healthz` (process is up) and `/readyz` (database reachable), plus JSON errors. */
export function createBaseApp(ping: () => Promise<void>): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  app.get('/readyz', async (c) => {
    try {
      await withTimeout(ping(), READY_TIMEOUT_MS);
      return c.json({ status: 'ok' });
    } catch (error) {
      console.error('readiness check failed:', error);
      return c.json({ status: 'unavailable' }, 503);
    }
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'No such route' } }, 404),
  );

  app.onError((error, c) => {
    if (error instanceof ProjectBusyError) {
      return c.json({ error: { code: 'locked', message: error.message } }, 423);
    }
    // A concurrent request created the same row first.
    if (isUniqueViolation(error)) {
      return c.json(
        { error: { code: 'conflict', message: 'The resource already exists' } },
        409,
      );
    }
    if (error instanceof HTTPException) {
      return c.json(
        { error: { code: 'http_error', message: error.message } },
        error.status,
      );
    }
    console.error('unhandled error:', error);
    return c.json(
      { error: { code: 'internal', message: 'Internal server error' } },
      500,
    );
  });

  return app;
}

export interface HttpModeContext<C extends Config> {
  config: C;
  handle: DatabaseHandle;
  app: Hono;
}

/** Cleanup a mode registers while setting itself up; runs before the database closes. */
export type Cleanup = () => Promise<void>;

/**
 * Shared bootstrap of the three HTTP modes: open the database, mount the health
 * routes, let the mode add its own routes, then listen. `stop` drains the
 * server before closing what the routes depend on.
 */
export async function startHttpMode<C extends Config>(
  config: C,
  setup: (context: HttpModeContext<C>) => Promise<Cleanup | undefined>,
): Promise<RunningMode> {
  const handle = createDatabase(config.databaseUrl, {
    applicationName: `control-plane-${config.mode}`,
  });
  const app = createBaseApp(() => pingDatabase(handle.sql));

  let cleanup: Cleanup | undefined;
  try {
    cleanup = await setup({ config, handle, app });
  } catch (error) {
    await handle.close();
    throw error;
  }

  // serve() creates a plain HTTP/1 server, so the node:http connection helpers exist.
  const server = serve({ fetch: app.fetch, port: config.port }) as Server;
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.info(`${config.mode} listening on :${config.port}`);

  return {
    async stop() {
      await new Promise<void>((resolve) => {
        const forced = setTimeout(
          () => server.closeAllConnections(),
          FORCE_CLOSE_AFTER_MS,
        );
        server.close(() => {
          clearTimeout(forced);
          resolve();
        });
        server.closeIdleConnections();
      });
      await cleanup?.();
      await handle.close();
    },
  };
}
