import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { ComputeRuntime } from '../neon/compute-runtime.js';
import { safekeeperHostname } from '../neon/safekeepers.js';
import { SpecNotReadyError, attachToConnectionInfo } from '../neon/spec.js';
import type { StorconClient } from '../neon/storcon-client.js';
import type { EndpointRow, NeonStore } from '../neon/store.js';
import { bearerAuth } from './auth.js';

/**
 * The hooks the storage controller calls: `PUT {control_plane_url}/notify-attach`
 * and `PUT .../notify-safekeepers` (storage_controller/src/compute_hook.rs:260,
 * 411), authorized with `Authorization: Bearer $CONTROL_PLANE_JWT_TOKEN`
 * (compute_hook.rs:620-623). Status codes follow how the controller reads them
 * (compute_hook.rs:694-743): 2xx is done; 503 and 429 are retried; 423 means
 * "stored, not fully applied" and fails the reconcile so it is retried later;
 * 400, 401 and 403 are never retried; a 404 is tolerated while a tenant is
 * being created (reconciler.rs:1060-1068).
 */

const neonId = z.string().regex(/^[0-9a-f]{32}$/);

/** `NotifyAttachRequest` (compute_hook.rs:329-341). */
const attachSchema = z.object({
  tenant_id: neonId,
  preferred_az: z.string().nullable().optional(),
  stripe_size: z.number().int().positive().nullable().optional(),
  shards: z
    .array(
      z.object({
        node_id: z.number().int(),
        shard_number: z.number().int().min(0).max(255),
      }),
    )
    .min(1),
});

/** `NotifySafekeepersRequest` (compute_hook.rs:343-358). `hostname` is documented as informational. */
const safekeepersSchema = z.object({
  tenant_id: neonId,
  timeline_id: neonId,
  generation: z.number().int().nonnegative(),
  safekeepers: z
    .array(
      z.object({
        id: z.number().int().min(1),
        hostname: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

const message = (code: string, text: string) => ({
  error: { code, message: text },
});

type Outcome = 'applied' | 'busy' | 'unavailable';

interface StorconRoutesDeps {
  store: NeonStore;
  runtime: ComputeRuntime;
  storcon: StorconClient;
  /** `CONTROL_PLANE_JWT_TOKEN` */
  controlPlaneToken: string;
  logger?: { error(...args: unknown[]): void };
}

async function readBody<T>(
  c: Context,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false as const,
      response: c.json(message('bad_request', 'Body is not JSON'), 400),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: c.json(
        message(
          'bad_request',
          parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        ),
        400,
      ),
    };
  }
  return { ok: true as const, body: parsed.data };
}

export function createStorconRoutes(deps: StorconRoutesDeps): Hono {
  const app = new Hono();
  const logger = deps.logger ?? console;
  app.use('*', bearerAuth(deps.controlPlaneToken));

  /**
   * Makes every running compute in `endpoints` apply a new spec. A compute that
   * is still starting may have fetched the old placement, so it reports busy and
   * the controller asks again; one that cannot be reached reports unavailable.
   */
  async function reload(
    endpoints: EndpointRow[],
    options: Parameters<ComputeRuntime['reconfigure']>[1],
  ): Promise<Outcome> {
    let outcome: Outcome = 'applied';
    for (const endpoint of endpoints) {
      if (endpoint.state === 'starting') {
        if (outcome === 'applied') outcome = 'busy';
        continue;
      }
      try {
        await deps.runtime.reconfigure(endpoint.id, options);
      } catch (error) {
        logger.error(`reloading ${endpoint.id} failed:`, error);
        outcome = 'unavailable';
      }
    }
    return outcome;
  }

  const answer = (c: Context, outcome: Outcome) => {
    if (outcome === 'applied') return c.json({});
    if (outcome === 'busy') {
      return c.json(
        message('locked', 'A compute is starting; retry once it is running'),
        423,
      );
    }
    return c.json(
      message('unavailable', 'A compute could not be reloaded'),
      503,
    );
  };

  app.put('/notify-attach', async (c) => {
    const read = await readBody(c, attachSchema);
    if (!read.ok) return read.response;
    const attach = { ...read.body, stripe_size: read.body.stripe_size ?? null };
    const project = await deps.store.findProjectByTenant(attach.tenant_id);
    if (!project) return c.json(message('not_found', 'Unknown tenant'), 404);

    // The placement is not stored: spec building asks the controller (locate)
    // every time, so the notification only has to make running computes reload.
    const endpoints = await deps.store.listTenantEndpoints(attach.tenant_id, [
      'running',
      'starting',
    ]);
    if (!endpoints.some((e) => e.state === 'running'))
      return answer(c, endpoints.length ? 'busy' : 'applied');
    try {
      const pageservers = attachToConnectionInfo(
        attach,
        await deps.storcon.listNodes(),
      );
      return answer(c, await reload(endpoints, { pageservers }));
    } catch (error) {
      // An unknown pageserver, an unreachable controller or a failed reload:
      // the controller retries on 503.
      logger.error('notify-attach failed:', error);
      return answer(c, 'unavailable');
    }
  });

  app.put('/notify-safekeepers', async (c) => {
    const read = await readBody(c, safekeepersSchema);
    if (!read.ok) return read.response;
    const { tenant_id, timeline_id, generation, safekeepers } = read.body;
    const branch = await deps.store.findBranchByTimeline(
      tenant_id,
      timeline_id,
    );
    if (!branch) return c.json(message('not_found', 'Unknown timeline'), 404);

    const changed = await deps.store.updateBranchPlacement(branch.id, {
      safekeepers: {
        generation,
        safekeepers: safekeepers.map((sk) => ({
          id: sk.id,
          hostname: sk.hostname || safekeeperHostname(sk.id),
        })),
      },
    });
    // An older generation than the stored one is a stale notification.
    if (!changed) return c.json({});
    const endpoints = (await deps.store.listBranchEndpoints(branch.id)).filter(
      (e) => e.state === 'running' || e.state === 'starting',
    );
    return answer(c, await reload(endpoints, undefined));
  });

  return app;
}
