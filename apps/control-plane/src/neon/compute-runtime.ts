import type { V1Pod } from '@kubernetes/client-node';
import type { Ed25519Signer } from '../crypto/ed25519.js';
import { PodAlreadyExistsError, type PodApi } from '../k8s/pods.js';
import {
  type ComputeCtlClient,
  ComputeCtlError,
} from './compute-ctl-client.js';
import {
  type PostgrestSidecar,
  buildComputePod,
  computePodName,
} from './compute-pod.js';
import {
  EndpointNotFoundError,
  type SpecOptions,
  type SpecService,
} from './spec-service.js';
import type { EndpointContext, NeonStore } from './store.js';
import { mintComputeSpecToken } from './tokens.js';

/**
 * Starts, reconfigures and stops compute pods. The database row of an endpoint
 * is the cross-process lock: `idle -> starting` is a compare-and-set in
 * Postgres, so two neon-glue replicas (or the worker) never both create a pod.
 * Within one process a map of in-flight wakes additionally makes concurrent
 * callers share one promise.
 */

export class WakeTimeoutError extends Error {
  constructor(
    readonly endpointId: string,
    detail: string,
  ) {
    super(`Endpoint ${endpointId} did not become ready: ${detail}`);
    this.name = 'WakeTimeoutError';
  }
}

/** The compute or its pod failed while starting. */
export class ComputeStartError extends Error {
  constructor(
    readonly endpointId: string,
    detail: string,
  ) {
    super(`Endpoint ${endpointId} failed to start: ${detail}`);
    this.name = 'ComputeStartError';
  }
}

/** The endpoint is in a state that does not allow the request (for example, suspend while starting). */
export class EndpointBusyError extends Error {
  constructor(
    readonly endpointId: string,
    state: string,
  ) {
    super(`Endpoint ${endpointId} is ${state}`);
    this.name = 'EndpointBusyError';
  }
}

interface WakeResult {
  podName: string;
  podIp: string;
  /** True when this call started the compute, false when it was already running. */
  coldStart: boolean;
}

export interface ComputeRuntime {
  wake(endpointId: string): Promise<WakeResult>;
  /** Stops the compute and deletes its pod. Safe to repeat. */
  suspend(endpointId: string): Promise<'suspended' | 'already-idle'>;
  /**
   * Applies the endpoint's current spec to its running compute. Returns false
   * when nothing is running, in which case the next start picks the spec up.
   */
  reconfigure(endpointId: string, options?: SpecOptions): Promise<boolean>;
}

interface Timings {
  /** Budget for one wake, from claim to a running compute. */
  wakeTimeoutMs: number;
  pollIntervalMs: number;
  /** A `starting` claim older than this is presumed abandoned by a crashed process. */
  startStaleMs: number;
}

const DEFAULT_TIMINGS: Timings = {
  wakeTimeoutMs: 180_000,
  pollIntervalMs: 500,
  startStaleMs: 6 * 60_000,
};

interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ComputeRuntimeDeps {
  store: NeonStore;
  pods: PodApi;
  computeCtl: ComputeCtlClient;
  specs: SpecService;
  signer: Ed25519Signer;
  config: {
    computeImage: string;
    postgrestImage: string;
    controlPlaneUri: string;
  };
  /** Data API containers to add to an endpoint's pod; none until the Data API ships. */
  sidecars?: (context: EndpointContext) => Promise<PostgrestSidecar[]>;
  timings?: Partial<Timings>;
  clock?: Clock;
  logger?: { warn(message: string): void };
}

/** Waiting reasons worth quoting in a timeout message. */
const podWaitingReason = (pod: V1Pod): string | undefined =>
  pod.status?.containerStatuses?.find((c) => c.state?.waiting)?.state?.waiting
    ?.reason;

export function createComputeRuntime(deps: ComputeRuntimeDeps): ComputeRuntime {
  const { store, pods, computeCtl, specs } = deps;
  const timings = { ...DEFAULT_TIMINGS, ...deps.timings };
  const clock = deps.clock ?? systemClock;
  const logger = deps.logger ?? console;
  const inflight = new Map<string, Promise<WakeResult>>();

  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /** Removes a pod and waits until the API no longer lists it, so its name can be reused. */
  async function deletePodAndWait(
    name: string,
    deadline: number,
  ): Promise<void> {
    await pods.delete(name);
    while ((await pods.get(name)) !== null) {
      if (clock.now().getTime() >= deadline) {
        throw new Error(`Pod ${name} is still terminating`);
      }
      await clock.sleep(timings.pollIntervalMs);
    }
  }

  async function createOrReplacePod(
    pod: V1Pod,
    deadline: number,
  ): Promise<void> {
    const name = pod.metadata?.name as string;
    try {
      await pods.create(pod);
      return;
    } catch (error) {
      if (!(error instanceof PodAlreadyExistsError)) throw error;
    }
    const existing = await pods.get(name);
    const phase = existing?.status?.phase;
    const usable =
      existing !== null &&
      !existing.metadata?.deletionTimestamp &&
      phase !== 'Failed' &&
      phase !== 'Succeeded';
    if (usable) return; // a previous attempt of this start; adopt its pod
    if (existing !== null) await deletePodAndWait(name, deadline);
    await pods.create(pod);
  }

  async function waitForPodIp(
    name: string,
    endpointId: string,
    deadline: number,
  ) {
    let reason: string | undefined;
    for (;;) {
      const pod = await pods.get(name);
      if (pod === null) {
        throw new ComputeStartError(endpointId, `pod ${name} disappeared`);
      }
      if (pod.status?.phase === 'Failed') {
        throw new ComputeStartError(
          endpointId,
          `pod ${name} failed: ${pod.status.reason ?? pod.status.message ?? 'unknown reason'}`,
        );
      }
      if (pod.status?.phase === 'Running' && pod.status.podIP) {
        return pod.status.podIP;
      }
      reason = podWaitingReason(pod) ?? reason;
      if (clock.now().getTime() >= deadline) {
        throw new WakeTimeoutError(
          endpointId,
          `pod ${name} has no IP (${reason ?? pod.status?.phase ?? 'unknown'})`,
        );
      }
      await clock.sleep(timings.pollIntervalMs);
    }
  }

  async function waitForRunning(
    podIp: string,
    endpointId: string,
    deadline: number,
  ) {
    let last = 'unreachable';
    for (;;) {
      try {
        const report = await computeCtl.status(podIp, endpointId);
        if (report.status === 'running') return;
        if (report.status === 'failed') {
          throw new ComputeStartError(
            endpointId,
            `compute_ctl reports failed: ${report.error ?? 'no error given'}`,
          );
        }
        last = report.status;
      } catch (error) {
        // Not listening yet while the container boots; anything else is real.
        if (!(error instanceof ComputeCtlError) || error.status !== null)
          throw error;
        last = 'unreachable';
      }
      if (clock.now().getTime() >= deadline) {
        throw new WakeTimeoutError(endpointId, `compute_ctl status is ${last}`);
      }
      await clock.sleep(timings.pollIntervalMs);
    }
  }

  /** Stale row or dead pod: forget the pod so the next wake starts a fresh one. */
  async function resetToIdle(endpointId: string): Promise<void> {
    await pods.delete(computePodName(endpointId));
    await store.markEndpointIdle(endpointId);
  }

  async function start(
    context: EndpointContext,
    deadline: number,
  ): Promise<WakeResult> {
    const { endpoint, project, branch } = context;
    const name = computePodName(endpoint.id);
    try {
      // Fail before creating anything if the spec cannot be built yet.
      await specs.forEndpoint(endpoint.id);
      const pod = buildComputePod({
        endpointId: endpoint.id,
        projectId: project.id,
        branchId: branch.id,
        computeSize: endpoint.computeSize,
        specToken: mintComputeSpecToken(deps.signer, {
          tenantId: project.tenantId,
          endpointId: endpoint.id,
        }),
        controlPlaneUri: deps.config.controlPlaneUri,
        computeImage: deps.config.computeImage,
        postgrestImage: deps.config.postgrestImage,
        sidecars: (await deps.sidecars?.(context)) ?? [],
      });
      await createOrReplacePod(pod, deadline);
      const podIp = await waitForPodIp(name, endpoint.id, deadline);
      await waitForRunning(podIp, endpoint.id, deadline);
      await store.markEndpointRunning(endpoint.id, {
        podName: name,
        podIp,
        at: clock.now(),
      });
      return { podName: name, podIp, coldStart: true };
    } catch (error) {
      logger.warn(`starting ${endpoint.id} failed: ${errorMessage(error)}`);
      await resetToIdle(endpoint.id).catch((cleanup) =>
        logger.warn(
          `cleaning up ${endpoint.id} failed: ${errorMessage(cleanup)}`,
        ),
      );
      throw error;
    }
  }

  async function doWake(endpointId: string): Promise<WakeResult> {
    const deadline = clock.now().getTime() + timings.wakeTimeoutMs;
    for (;;) {
      const context = await store.getEndpointContext(endpointId);
      if (!context) throw new EndpointNotFoundError(endpointId);
      const { endpoint } = context;
      const name = computePodName(endpointId);

      if (endpoint.state === 'running') {
        const pod = endpoint.podIp ? await pods.get(name) : null;
        const phase = pod?.status?.phase;
        if (
          pod &&
          phase !== 'Failed' &&
          phase !== 'Succeeded' &&
          endpoint.podIp
        ) {
          await store.touchEndpoint(endpointId, clock.now());
          return { podName: name, podIp: endpoint.podIp, coldStart: false };
        }
        await resetToIdle(endpointId); // the row says running but the pod is gone
        continue;
      }

      const claimed = await store.claimEndpointState(
        endpointId,
        ['idle'],
        'starting',
        {
          now: clock.now(),
          staleBefore: new Date(clock.now().getTime() - timings.startStaleMs),
        },
      );
      if (claimed) return start(context, deadline);

      // Another process is starting or suspending it: wait for that to settle.
      if (clock.now().getTime() >= deadline) {
        throw new WakeTimeoutError(endpointId, `still ${endpoint.state}`);
      }
      await clock.sleep(timings.pollIntervalMs);
    }
  }

  return {
    wake(endpointId) {
      const running = inflight.get(endpointId);
      if (running) return running;
      const wake = doWake(endpointId).finally(() =>
        inflight.delete(endpointId),
      );
      inflight.set(endpointId, wake);
      return wake;
    },

    async suspend(endpointId) {
      const name = computePodName(endpointId);
      const context = await store.getEndpointContext(endpointId, {
        includeDeleted: true,
      });
      if (!context) {
        await pods.delete(name);
        return 'already-idle';
      }
      const claimed = await store.claimEndpointState(
        endpointId,
        ['running', 'suspending'],
        'suspending',
        { now: clock.now() },
      );
      if (!claimed) {
        const current = await store.getEndpointContext(endpointId, {
          includeDeleted: true,
        });
        if (current?.endpoint.state === 'starting') {
          throw new EndpointBusyError(endpointId, 'starting');
        }
        await pods.delete(name); // idle rows must not own a pod
        return 'already-idle';
      }
      const { podIp } = context.endpoint;
      if (podIp) {
        try {
          await computeCtl.terminate(podIp, endpointId);
        } catch (error) {
          // The pod is deleted next either way; a compute that will not
          // terminate cleanly is not a reason to keep it running.
          logger.warn(`terminate ${endpointId}: ${errorMessage(error)}`);
        }
      }
      await pods.delete(name);
      await store.markEndpointIdle(endpointId);
      return 'suspended';
    },

    async reconfigure(endpointId, options) {
      const context = await store.getEndpointContext(endpointId);
      if (!context) throw new EndpointNotFoundError(endpointId);
      const { endpoint } = context;
      if (endpoint.state !== 'running' || !endpoint.podIp) return false;
      const config = await specs.forEndpoint(endpointId, options);
      await computeCtl.configure(endpoint.podIp, endpointId, config);
      return true;
    },
  };
}
