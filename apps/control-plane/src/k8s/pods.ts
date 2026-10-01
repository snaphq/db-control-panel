import type { CoreV1Api, V1Pod } from '@kubernetes/client-node';
import { COMPUTE_NAMESPACE } from '../neon/compute-pod.js';

/** Pod operations the compute runtime needs; a fake implements this in tests. */
export interface PodApi {
  /** Throws {@link PodAlreadyExistsError} when the name is taken. */
  create(pod: V1Pod): Promise<V1Pod>;
  get(name: string): Promise<V1Pod | null>;
  /** Missing pods are fine: deleting twice is the same as deleting once. */
  delete(name: string): Promise<void>;
}

export class PodAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`Pod ${name} already exists`);
    this.name = 'PodAlreadyExistsError';
  }
}

const statusOf = (error: unknown): number | undefined =>
  typeof (error as { code?: unknown }).code === 'number'
    ? (error as { code: number }).code
    : undefined;

/** Pods in the `neon-compute` namespace, through the in-cluster client. */
export function createPodApi(
  core: Pick<
    CoreV1Api,
    'createNamespacedPod' | 'readNamespacedPod' | 'deleteNamespacedPod'
  >,
): PodApi {
  const namespace = COMPUTE_NAMESPACE;
  return {
    async create(pod) {
      try {
        return await core.createNamespacedPod({ namespace, body: pod });
      } catch (error) {
        if (statusOf(error) === 409) {
          throw new PodAlreadyExistsError(pod.metadata?.name ?? '(unnamed)');
        }
        throw error;
      }
    },
    async get(name) {
      try {
        return await core.readNamespacedPod({ name, namespace });
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },
    async delete(name) {
      try {
        await core.deleteNamespacedPod({ name, namespace });
      } catch (error) {
        if (statusOf(error) !== 404) throw error;
      }
    },
  };
}
