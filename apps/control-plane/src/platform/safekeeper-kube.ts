import type { AppsV1Api, CoreV1Api } from '@kubernetes/client-node';
import { SAFEKEEPER_NAMESPACE, safekeeperName } from '../neon/safekeepers.js';
import {
  SPEC_HASH_ANNOTATION,
  type SafekeeperWorkload,
  buildSafekeeperService,
  buildSafekeeperStatefulSet,
  safekeeperClaimName,
  safekeeperSpecHash,
} from './safekeeper-manifests.js';

export interface SafekeeperKubeStatus {
  exists: boolean;
  /** The single pod passes its readiness probe. */
  ready: boolean;
  /** The StatefulSet matches what the control plane would create now. */
  current: boolean;
}

/** What the platform operations need from Kubernetes; a fake implements this in tests. */
export interface SafekeeperKube {
  /** Creates the Service and StatefulSet when missing; never changes existing ones. */
  ensure(input: SafekeeperWorkload): Promise<void>;
  status(input: SafekeeperWorkload): Promise<SafekeeperKubeStatus>;
  /** Replaces a StatefulSet whose spec drifted (a new image), restarting its pod. */
  update(input: SafekeeperWorkload): Promise<void>;
  /** Deletes the StatefulSet, Service and volume claim. Missing objects are fine. */
  remove(id: number): Promise<void>;
}

const statusOf = (error: unknown): number | undefined =>
  typeof (error as { code?: unknown }).code === 'number'
    ? (error as { code: number }).code
    : undefined;

/** Runs `work`, treating 404 as "already gone". */
async function ignoreMissing(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
  }
}

/** Runs `work`, treating 409 as "already there". */
async function ignoreExists(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (statusOf(error) !== 409) throw error;
  }
}

export function createSafekeeperKube(
  apps: Pick<
    AppsV1Api,
    | 'createNamespacedStatefulSet'
    | 'readNamespacedStatefulSet'
    | 'replaceNamespacedStatefulSet'
    | 'deleteNamespacedStatefulSet'
  >,
  core: Pick<
    CoreV1Api,
    | 'createNamespacedService'
    | 'deleteNamespacedService'
    | 'deleteNamespacedPersistentVolumeClaim'
  >,
): SafekeeperKube {
  const namespace = SAFEKEEPER_NAMESPACE;

  return {
    async ensure(input) {
      await ignoreExists(
        core.createNamespacedService({
          namespace,
          body: buildSafekeeperService(input.id),
        }),
      );
      await ignoreExists(
        apps.createNamespacedStatefulSet({
          namespace,
          body: buildSafekeeperStatefulSet(input),
        }),
      );
    },

    async status(input) {
      try {
        const sts = await apps.readNamespacedStatefulSet({
          name: safekeeperName(input.id),
          namespace,
        });
        return {
          exists: true,
          ready: (sts.status?.readyReplicas ?? 0) >= 1,
          current:
            sts.metadata?.annotations?.[SPEC_HASH_ANNOTATION] ===
            safekeeperSpecHash(input),
        };
      } catch (error) {
        if (statusOf(error) === 404) {
          return { exists: false, ready: false, current: false };
        }
        throw error;
      }
    },

    async update(input) {
      const name = safekeeperName(input.id);
      const live = await apps.readNamespacedStatefulSet({ name, namespace });
      const body = buildSafekeeperStatefulSet(input);
      // The API wants the live resourceVersion on a replace. Everything immutable
      // (selector, claim templates) is rebuilt identically, so only the pod
      // template changes.
      body.metadata = {
        ...body.metadata,
        resourceVersion: live.metadata?.resourceVersion,
      };
      await apps.replaceNamespacedStatefulSet({ name, namespace, body });
    },

    async remove(id) {
      await ignoreMissing(
        apps.deleteNamespacedStatefulSet({
          name: safekeeperName(id),
          namespace,
        }),
      );
      await ignoreMissing(
        core.deleteNamespacedService({ name: safekeeperName(id), namespace }),
      );
      // A StatefulSet never deletes its claims; this is the safekeeper's data.
      await ignoreMissing(
        core.deleteNamespacedPersistentVolumeClaim({
          name: safekeeperClaimName(id),
          namespace,
        }),
      );
    },
  };
}
