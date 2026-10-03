import { describe, expect, it, vi } from 'vitest';
import { createSafekeeperKube } from './safekeeper-kube.js';
import {
  type SafekeeperWorkload,
  buildSafekeeperStatefulSet,
} from './safekeeper-manifests.js';

const workload: SafekeeperWorkload = {
  id: 2,
  nodeName: 'node-a',
  image: 'ghcr.io/snaphq/neon:one',
  pullSecret: null,
  entrypointConfigMap: 'safekeeper-entrypoint',
  storage: '50Gi',
};
const apiError = (code: number) =>
  Object.assign(new Error(`HTTP ${code}`), { code });

function setup() {
  const apps = {
    createNamespacedStatefulSet: vi.fn(async (_request: unknown) => ({})),
    readNamespacedStatefulSet: vi.fn(async (_request: unknown) => ({})),
    replaceNamespacedStatefulSet: vi.fn(async (_request: unknown) => ({})),
    deleteNamespacedStatefulSet: vi.fn(async (_request: unknown) => ({})),
  };
  const core = {
    createNamespacedService: vi.fn(async (_request: unknown) => ({})),
    deleteNamespacedService: vi.fn(async (_request: unknown) => ({})),
    deleteNamespacedPersistentVolumeClaim: vi.fn(
      async (_request: unknown) => ({}),
    ),
  };
  // biome-ignore lint/suspicious/noExplicitAny: partial API mocks
  return { apps, core, kube: createSafekeeperKube(apps as any, core as any) };
}

describe('ensure', () => {
  it('creates the Service and the StatefulSet in namespace neon', async () => {
    const { apps, core, kube } = setup();
    await kube.ensure(workload);
    expect(core.createNamespacedService).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'neon' }),
    );
    expect(apps.createNamespacedStatefulSet.mock.calls[0]?.[0]).toMatchObject({
      namespace: 'neon',
      body: { metadata: { name: 'safekeeper-2' } },
    });
  });

  it('treats objects that already exist as done, so it can run again', async () => {
    const { apps, core, kube } = setup();
    core.createNamespacedService.mockRejectedValue(apiError(409));
    apps.createNamespacedStatefulSet.mockRejectedValue(apiError(409));
    await expect(kube.ensure(workload)).resolves.toBeUndefined();
  });

  it('surfaces any other failure', async () => {
    const { apps, kube } = setup();
    apps.createNamespacedStatefulSet.mockRejectedValue(apiError(403));
    await expect(kube.ensure(workload)).rejects.toMatchObject({ code: 403 });
  });
});

describe('status', () => {
  it('reports readiness and whether the spec is current', async () => {
    const { apps, kube } = setup();
    const live = buildSafekeeperStatefulSet(workload);
    apps.readNamespacedStatefulSet.mockResolvedValue({
      ...live,
      metadata: { ...live.metadata, generation: 3 },
      status: {
        readyReplicas: 1,
        observedGeneration: 3,
        currentRevision: 'rev-1',
        updateRevision: 'rev-1',
      },
    } as never);
    expect(await kube.status(workload)).toEqual({
      exists: true,
      ready: true,
      current: true,
    });
    expect(
      await kube.status({ ...workload, image: 'ghcr.io/snaphq/neon:two' }),
    ).toMatchObject({ exists: true, current: false });
  });

  it('is not ready while a rollout is still replacing the pod, though the old one is Ready', async () => {
    const { apps, kube } = setup();
    const live = buildSafekeeperStatefulSet(workload);
    const mid = (status: object) =>
      apps.readNamespacedStatefulSet.mockResolvedValue({
        ...live,
        metadata: { ...live.metadata, generation: 4 },
        status: { readyReplicas: 1, ...status },
      } as never);
    // The controller has not seen the new generation yet.
    mid({
      observedGeneration: 3,
      currentRevision: 'rev-1',
      updateRevision: 'rev-1',
    });
    expect(await kube.status(workload)).toMatchObject({ ready: false });
    // It has, and is replacing the pod.
    mid({
      observedGeneration: 4,
      currentRevision: 'rev-1',
      updateRevision: 'rev-2',
    });
    expect(await kube.status(workload)).toMatchObject({ ready: false });
    // Done.
    mid({
      observedGeneration: 4,
      currentRevision: 'rev-2',
      updateRevision: 'rev-2',
    });
    expect(await kube.status(workload)).toMatchObject({ ready: true });
  });

  it('is not ready before the pod passes its probe', async () => {
    const { apps, kube } = setup();
    apps.readNamespacedStatefulSet.mockResolvedValue(
      buildSafekeeperStatefulSet(workload) as never,
    );
    expect(await kube.status(workload)).toMatchObject({ ready: false });
  });

  it('says a missing StatefulSet does not exist', async () => {
    const { apps, kube } = setup();
    apps.readNamespacedStatefulSet.mockRejectedValue(apiError(404));
    expect(await kube.status(workload)).toEqual({
      exists: false,
      ready: false,
      current: false,
    });
  });
});

describe('update', () => {
  it('replaces the StatefulSet carrying the live resourceVersion', async () => {
    const { apps, kube } = setup();
    apps.readNamespacedStatefulSet.mockResolvedValue({
      metadata: { resourceVersion: '77' },
    } as never);
    await kube.update({ ...workload, image: 'ghcr.io/snaphq/neon:two' });
    const call = apps.replaceNamespacedStatefulSet.mock
      .calls[0]?.[0] as unknown as {
      body: {
        metadata: { resourceVersion: string };
        spec: { template: { spec: { containers: { image: string }[] } } };
      };
    };
    expect(call.body.metadata.resourceVersion).toBe('77');
    expect(call.body.spec.template.spec.containers[0]?.image).toBe(
      'ghcr.io/snaphq/neon:two',
    );
  });
});

describe('a different volume size', () => {
  it('does not count as drift, and an update keeps the claim templates the set already has', async () => {
    const { apps, kube } = setup();
    const live = buildSafekeeperStatefulSet(workload);
    apps.readNamespacedStatefulSet.mockResolvedValue({
      ...live,
      metadata: { ...live.metadata, resourceVersion: '5', generation: 1 },
      status: { readyReplicas: 1, observedGeneration: 1 },
    } as never);
    const bigger = { ...workload, storage: '100Gi' };
    expect(await kube.status(bigger)).toMatchObject({ current: true });
    await kube.update({ ...bigger, image: 'ghcr.io/snaphq/neon:two' });
    const call = apps.replaceNamespacedStatefulSet.mock
      .calls[0]?.[0] as unknown as {
      body: {
        spec: {
          volumeClaimTemplates: {
            spec: { resources: { requests: { storage: string } } };
          }[];
        };
      };
    };
    expect(
      call.body.spec.volumeClaimTemplates[0]?.spec.resources.requests.storage,
    ).toBe('50Gi');
  });
});

describe('remove', () => {
  it('deletes the StatefulSet, the Service and the volume claim', async () => {
    const { apps, core, kube } = setup();
    await kube.remove(2);
    expect(apps.deleteNamespacedStatefulSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'safekeeper-2', namespace: 'neon' }),
    );
    expect(core.deleteNamespacedService).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'safekeeper-2' }),
    );
    expect(core.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'data-safekeeper-2-0' }),
    );
  });

  it('is repeatable: objects that are already gone are fine', async () => {
    const { apps, core, kube } = setup();
    apps.deleteNamespacedStatefulSet.mockRejectedValue(apiError(404));
    core.deleteNamespacedService.mockRejectedValue(apiError(404));
    core.deleteNamespacedPersistentVolumeClaim.mockRejectedValue(apiError(404));
    await expect(kube.remove(2)).resolves.toBeUndefined();
  });
});
