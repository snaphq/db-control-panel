import { describe, expect, it } from 'vitest';
import {
  SPEC_HASH_ANNOTATION,
  type SafekeeperWorkload,
  buildSafekeeperService,
  buildSafekeeperStatefulSet,
  safekeeperClaimName,
  safekeeperSpecHash,
} from './safekeeper-manifests.js';

const workload: SafekeeperWorkload = {
  id: 4,
  nodeName: 'hel-2',
  image: 'ghcr.io/snaphq/neon:abc123',
  pullSecret: 'ghcr-pull',
  entrypointConfigMap: 'safekeeper-entrypoint',
  storage: '50Gi',
};

describe('buildSafekeeperStatefulSet', () => {
  const sts = buildSafekeeperStatefulSet(workload);
  const pod = sts.spec?.template.spec;
  const container = pod?.containers[0];
  const env = Object.fromEntries(
    (container?.env ?? []).map((e) => [e.name, e.value]),
  );

  it('is one replica named for the id, with a volume claim of the requested size', () => {
    expect(sts.metadata?.name).toBe('safekeeper-4');
    expect(sts.metadata?.namespace).toBe('neon');
    expect(sts.spec?.replicas).toBe(1);
    const claim = sts.spec?.volumeClaimTemplates?.[0];
    expect(claim?.metadata?.name).toBe('data');
    expect(claim?.spec?.storageClassName).toBe('local-path');
    expect(claim?.spec?.resources?.requests?.storage).toBe('50Gi');
    expect(safekeeperClaimName(4)).toBe('data-safekeeper-4-0');
  });

  it('pins the pod to the chosen node', () => {
    expect(pod?.nodeSelector).toEqual({ 'kubernetes.io/hostname': 'hel-2' });
  });

  it('gives identity through env, not through the pod ordinal', () => {
    expect(env.SAFEKEEPER_ID).toBe('4');
    expect(env.SAFEKEEPER_AZ).toBe('az-4');
    expect(env.POD_NAME).toBeUndefined();
    expect(container?.command).toEqual([
      '/bin/sh',
      '/scripts/safekeeper-entrypoint.sh',
    ]);
  });

  it('keeps the ports, probes and secrets of the GitOps manifest', () => {
    expect(container?.ports?.map((p) => p.containerPort)).toEqual([5454, 7676]);
    for (const probe of [
      container?.startupProbe,
      container?.readinessProbe,
      container?.livenessProbe,
    ]) {
      expect(probe?.httpGet).toEqual({ path: '/v1/status', port: 'http' });
    }
    expect(container?.startupProbe?.failureThreshold).toBe(60);
    const secrets = (container?.env ?? [])
      .filter((e) => e.valueFrom?.secretKeyRef)
      .map(
        (e) =>
          `${e.valueFrom?.secretKeyRef?.name}/${e.valueFrom?.secretKeyRef?.key}`,
      );
    expect(secrets).toContain('neon-s3/S3_BUCKET');
    expect(secrets).toContain('neon-s3/AWS_SECRET_ACCESS_KEY');
    const jwt = pod?.volumes?.find((v) => v.name === 'jwt');
    expect(jwt?.secret?.secretName).toBe('neon-jwt');
    expect(jwt?.secret?.items?.map((i) => i.key)).toEqual([
      'public.pem',
      'SAFEKEEPER_JWT_TOKEN',
    ]);
    expect(
      pod?.volumes?.find((v) => v.name === 'scripts')?.configMap?.name,
    ).toBe('safekeeper-entrypoint');
  });

  it('selects only its own pod and is matched by the shared disruption budget', () => {
    expect(sts.spec?.selector.matchLabels).toEqual({
      'app.kubernetes.io/name': 'safekeeper',
      'alloydb.net/safekeeper-id': '4',
    });
    // infra/k8s/neon/safekeeper.yaml's PodDisruptionBudget selects name=safekeeper.
    expect(sts.spec?.template.metadata?.labels).toMatchObject({
      'app.kubernetes.io/name': 'safekeeper',
      'alloydb.net/safekeeper-id': '4',
    });
  });

  it('leaves out the pull secret when there is none', () => {
    const bare = buildSafekeeperStatefulSet({ ...workload, pullSecret: null });
    expect(bare.spec?.template.spec?.imagePullSecrets).toBeUndefined();
    expect(pod?.imagePullSecrets).toEqual([{ name: 'ghcr-pull' }]);
  });

  it('records a hash that changes with the image or the node, and only then', () => {
    expect(sts.metadata?.annotations?.[SPEC_HASH_ANNOTATION]).toBe(
      safekeeperSpecHash(workload),
    );
    expect(safekeeperSpecHash({ ...workload })).toBe(
      safekeeperSpecHash(workload),
    );
    expect(
      safekeeperSpecHash({ ...workload, image: 'ghcr.io/snaphq/neon:def' }),
    ).not.toBe(safekeeperSpecHash(workload));
    expect(safekeeperSpecHash({ ...workload, nodeName: 'hel-3' })).not.toBe(
      safekeeperSpecHash(workload),
    );
  });
});

describe('buildSafekeeperService', () => {
  const service = buildSafekeeperService(4);

  it('is a stable address for one safekeeper, resolvable before it is Ready', () => {
    expect(service.metadata?.name).toBe('safekeeper-4');
    expect(service.spec?.selector).toEqual({
      'app.kubernetes.io/name': 'safekeeper',
      'alloydb.net/safekeeper-id': '4',
    });
    expect(service.spec?.publishNotReadyAddresses).toBe(true);
    expect(service.spec?.clusterIP).toBeUndefined();
    expect(service.spec?.ports?.map((p) => p.port)).toEqual([5454, 7676]);
  });
});
