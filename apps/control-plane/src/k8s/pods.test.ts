import { describe, expect, it, vi } from 'vitest';
import { PodAlreadyExistsError, createPodApi } from './pods.js';

const apiError = (code: number) =>
  Object.assign(new Error(`HTTP ${code}`), { code });

function setup(overrides: Record<string, unknown> = {}) {
  const core = {
    createNamespacedPod: vi.fn(async ({ body }) => body),
    readNamespacedPod: vi.fn(async ({ name }) => ({ metadata: { name } })),
    deleteNamespacedPod: vi.fn(async () => ({})),
    ...overrides,
  };
  return { core, pods: createPodApi(core as never) };
}

describe('createPodApi', () => {
  it('works in the neon-compute namespace', async () => {
    const { core, pods } = setup();
    await pods.create({ metadata: { name: 'compute-a' } });
    await pods.get('compute-a');
    await pods.delete('compute-a');
    expect(core.createNamespacedPod).toHaveBeenCalledWith({
      namespace: 'neon-compute',
      body: { metadata: { name: 'compute-a' } },
    });
    expect(core.readNamespacedPod).toHaveBeenCalledWith({
      name: 'compute-a',
      namespace: 'neon-compute',
    });
    expect(core.deleteNamespacedPod).toHaveBeenCalledWith({
      name: 'compute-a',
      namespace: 'neon-compute',
    });
  });

  it('turns 409 into PodAlreadyExistsError', async () => {
    const { pods } = setup({
      createNamespacedPod: vi.fn(async () => {
        throw apiError(409);
      }),
    });
    await expect(
      pods.create({ metadata: { name: 'compute-a' } }),
    ).rejects.toBeInstanceOf(PodAlreadyExistsError);
  });

  it('reads a missing pod as null and ignores a missing pod on delete', async () => {
    const { pods } = setup({
      readNamespacedPod: vi.fn(async () => {
        throw apiError(404);
      }),
      deleteNamespacedPod: vi.fn(async () => {
        throw apiError(404);
      }),
    });
    expect(await pods.get('gone')).toBeNull();
    await expect(pods.delete('gone')).resolves.toBeUndefined();
  });

  it('lets other errors through', async () => {
    const { pods } = setup({
      readNamespacedPod: vi.fn(async () => {
        throw apiError(500);
      }),
      deleteNamespacedPod: vi.fn(async () => {
        throw apiError(403);
      }),
    });
    await expect(pods.get('a')).rejects.toMatchObject({ code: 500 });
    await expect(pods.delete('a')).rejects.toMatchObject({ code: 403 });
  });
});
