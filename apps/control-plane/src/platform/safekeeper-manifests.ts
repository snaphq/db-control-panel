import { createHash } from 'node:crypto';
import type {
  V1Container,
  V1Service,
  V1StatefulSet,
} from '@kubernetes/client-node';
import {
  SAFEKEEPER_HTTP_PORT,
  SAFEKEEPER_NAMESPACE,
  SAFEKEEPER_PG_PORT,
  safekeeperAz,
  safekeeperName,
} from '../neon/safekeepers.js';

/**
 * The Kubernetes objects of one safekeeper. They replace the GitOps
 * StatefulSet `safekeeper` (three ordinals): the container, flags, secrets and
 * probes are the ones of that manifest; what changed is that identity comes from
 * env (`SAFEKEEPER_ID`, `SAFEKEEPER_AZ`) instead of the pod ordinal, the pod is
 * pinned to a node, and the advertised address is the safekeeper's own Service.
 * Contract: docs-internal/platform/architecture.mdx.
 */

const MANAGED_BY = 'alloydb-control-plane';
export const SPEC_HASH_ANNOTATION = 'alloydb.net/spec-hash';
const ID_LABEL = 'alloydb.net/safekeeper-id';

export interface SafekeeperWorkload {
  id: number;
  /** Kubernetes node name; the pod selects `kubernetes.io/hostname` with it. */
  nodeName: string;
  /** The Neon image (storage_broker, storage_controller, pageserver, safekeeper). */
  image: string;
  /** Pull Secret name, or null for none. */
  pullSecret: string | null;
  /** ConfigMap holding `safekeeper-entrypoint.sh` (infra/k8s/neon). */
  entrypointConfigMap: string;
  /** Size of the local-path volume. */
  storage: string;
}

/** Labels every safekeeper object carries; the shared PodDisruptionBudget selects on the first two. */
const baseLabels = {
  'app.kubernetes.io/name': 'safekeeper',
  'app.kubernetes.io/component': 'safekeeper',
  'app.kubernetes.io/part-of': 'alloydb',
  'app.kubernetes.io/managed-by': MANAGED_BY,
};

const idLabels = (id: number) => ({ ...baseLabels, [ID_LABEL]: String(id) });
const selectorLabels = (id: number) => ({
  'app.kubernetes.io/name': 'safekeeper',
  [ID_LABEL]: String(id),
});

export function buildSafekeeperService(id: number): V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: safekeeperName(id),
      namespace: SAFEKEEPER_NAMESPACE,
      labels: idLabels(id),
    },
    spec: {
      type: 'ClusterIP',
      // Peers, pageservers and the registering worker must resolve the name as
      // soon as the pod exists, not only once it is Ready.
      publishNotReadyAddresses: true,
      selector: selectorLabels(id),
      ports: [
        { name: 'pg', port: SAFEKEEPER_PG_PORT, targetPort: 'pg' },
        { name: 'http', port: SAFEKEEPER_HTTP_PORT, targetPort: 'http' },
      ],
    },
  };
}

const secretEnv = (
  name: string,
  secret: string,
  key: string,
  optional = false,
) => ({
  name,
  valueFrom: {
    secretKeyRef: { name: secret, key, ...(optional ? { optional } : {}) },
  },
});

function container(input: SafekeeperWorkload): V1Container {
  const status = { path: '/v1/status', port: 'http' };
  return {
    name: 'safekeeper',
    image: input.image,
    command: ['/bin/sh', '/scripts/safekeeper-entrypoint.sh'],
    env: [
      { name: 'SAFEKEEPER_ID', value: String(input.id) },
      { name: 'SAFEKEEPER_AZ', value: safekeeperAz(input.id) },
      {
        name: 'POD_NAMESPACE',
        valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } },
      },
      {
        name: 'BROKER_ENDPOINT',
        value: 'http://storage-broker.neon.svc.cluster.local:50051',
      },
      { name: 'JWT_DIR', value: '/etc/neon/jwt' },
      secretEnv('S3_BUCKET', 'neon-s3', 'S3_BUCKET'),
      secretEnv('S3_REGION', 'neon-s3', 'AWS_REGION'),
      // Absent or empty means AWS S3 proper.
      secretEnv('S3_ENDPOINT', 'neon-s3', 'S3_ENDPOINT', true),
      secretEnv('AWS_ACCESS_KEY_ID', 'neon-s3', 'AWS_ACCESS_KEY_ID'),
      secretEnv('AWS_SECRET_ACCESS_KEY', 'neon-s3', 'AWS_SECRET_ACCESS_KEY'),
    ],
    ports: [
      { name: 'pg', containerPort: SAFEKEEPER_PG_PORT },
      { name: 'http', containerPort: SAFEKEEPER_HTTP_PORT },
    ],
    // /v1/status is on the unauthenticated allowlist (safekeeper/src/http/routes.rs).
    startupProbe: {
      httpGet: status,
      periodSeconds: 5,
      failureThreshold: 60, // up to 5 minutes: syncfs and timeline load on a big disk
    },
    readinessProbe: { httpGet: status, periodSeconds: 5, timeoutSeconds: 3 },
    livenessProbe: {
      httpGet: status,
      periodSeconds: 10,
      timeoutSeconds: 5,
      failureThreshold: 6,
    },
    securityContext: {
      allowPrivilegeEscalation: false,
      capabilities: { drop: ['ALL'] },
    },
    resources: {
      requests: { cpu: '250m', memory: '512Mi' },
      limits: { memory: '2Gi' },
    },
    volumeMounts: [
      { name: 'data', mountPath: '/data' },
      { name: 'scripts', mountPath: '/scripts', readOnly: true },
      { name: 'jwt', mountPath: '/etc/neon/jwt', readOnly: true },
    ],
  };
}

/** The StatefulSet without its spec-hash annotation. */
function statefulSetBody(input: SafekeeperWorkload): V1StatefulSet {
  const { id } = input;
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: safekeeperName(id),
      namespace: SAFEKEEPER_NAMESPACE,
      labels: idLabels(id),
    },
    spec: {
      // The headless Service `safekeeper` (infra/k8s/neon) gives the pod a DNS name.
      serviceName: 'safekeeper',
      replicas: 1,
      podManagementPolicy: 'Parallel',
      updateStrategy: { type: 'RollingUpdate' },
      selector: { matchLabels: selectorLabels(id) },
      template: {
        metadata: { labels: idLabels(id) },
        spec: {
          // Fixed by the layout policy; local-path volumes tie the data to it.
          nodeSelector: { 'kubernetes.io/hostname': input.nodeName },
          enableServiceLinks: false,
          ...(input.pullSecret
            ? { imagePullSecrets: [{ name: input.pullSecret }] }
            : {}),
          terminationGracePeriodSeconds: 60,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000, // numeric uid of image user `neon`, UNVERIFIED (see storage-broker.yaml)
            runAsGroup: 1000,
            fsGroup: 1000, // makes the PVC writable for that uid
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [container(input)],
          volumes: [
            {
              name: 'scripts',
              configMap: {
                name: input.entrypointConfigMap,
                defaultMode: 0o555,
              },
            },
            {
              name: 'jwt',
              secret: {
                secretName: 'neon-jwt',
                defaultMode: 0o440,
                items: [
                  { key: 'public.pem', path: 'public.pem' },
                  { key: 'SAFEKEEPER_JWT_TOKEN', path: 'safekeeper-token' },
                ],
              },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'data', labels: idLabels(id) },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'local-path',
            resources: { requests: { storage: input.storage } },
          },
        },
      ],
    },
  };
}

/**
 * Fingerprint of everything the control plane may change on a live StatefulSet.
 * The volume claim templates are left out: Kubernetes forbids changing them, so
 * a different `ALLOYDB_SAFEKEEPER_STORAGE` only applies to new safekeepers.
 */
export function safekeeperSpecHash(input: SafekeeperWorkload): string {
  const body = statefulSetBody(input);
  const { volumeClaimTemplates: _immutable, ...spec } = body.spec ?? {};
  return createHash('sha256')
    .update(JSON.stringify({ ...body, spec }))
    .digest('hex')
    .slice(0, 16);
}

export function buildSafekeeperStatefulSet(
  input: SafekeeperWorkload,
): V1StatefulSet {
  const body = statefulSetBody(input);
  return {
    ...body,
    metadata: {
      ...body.metadata,
      annotations: { [SPEC_HASH_ANNOTATION]: safekeeperSpecHash(input) },
    },
  };
}

/** Name of the PersistentVolumeClaim the StatefulSet's single replica owns. */
export const safekeeperClaimName = (id: number): string =>
  `data-${safekeeperName(id)}-0`;
