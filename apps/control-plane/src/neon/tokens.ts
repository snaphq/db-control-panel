import type { Ed25519Signer } from '../crypto/ed25519.js';
import { isEndpointId, isNeonId } from '../crypto/ids.js';

/**
 * Serialized `Scope` values from libs/utils/src/auth.rs. The enum uses
 * `#[serde(rename_all = "lowercase")]`, so multi-word variants have no
 * separator (`TenantEndpoint` is "tenantendpoint", `PageServerApi` is
 * "pageserverapi"); only `GenerationsApi` and `ControllerPeer` carry an
 * explicit `rename` with an underscore.
 */
type NeonScope =
  | 'tenant'
  | 'tenantendpoint'
  | 'pageserverapi'
  | 'safekeeperdata'
  | 'generations_api'
  | 'admin'
  | 'infra'
  | 'scrubber'
  | 'controller_peer';

const TENANT_BOUND_SCOPES: ReadonlySet<NeonScope> = new Set([
  'tenant',
  'tenantendpoint',
]);

export interface StorageTokenInput {
  scope: NeonScope;
  /** Required for `tenant` and `tenantendpoint`, rejected elsewhere. */
  tenantId?: string;
}

/** Claims of Neon's `Claims` struct: `{tenant_id?, scope}` (endpoint_id is a UUID we do not use). */
interface StorageClaims {
  scope: NeonScope;
  tenant_id?: string;
}

/**
 * Mints a storage-plane token (pageserver, safekeeper, storage controller,
 * control-plane hooks). Neon requires EdDSA and does not require `exp`
 * (`validation.required_spec_claims = []` in `JwtAuth::new`), so these tokens
 * are long-lived and carry only `iat` next to the Neon claims; rotating the
 * signing key is how they are revoked.
 */
export function mintStorageToken(
  signer: Ed25519Signer,
  input: StorageTokenInput,
  now: Date = new Date(),
): string {
  const tenantBound = TENANT_BOUND_SCOPES.has(input.scope);
  if (tenantBound) {
    if (!input.tenantId || !isNeonId(input.tenantId)) {
      throw new Error(
        `Scope "${input.scope}" needs a 32-hex tenant id, got ${JSON.stringify(input.tenantId)}`,
      );
    }
  } else if (input.tenantId !== undefined) {
    throw new Error(`Scope "${input.scope}" must not carry a tenant id`);
  }

  const claims: StorageClaims & { iat: number } = {
    scope: input.scope,
    ...(tenantBound ? { tenant_id: input.tenantId } : {}),
    iat: Math.floor(now.getTime() / 1000),
  };
  return signer.sign(claims);
}

/** `COMPUTE_AUDIENCE` in libs/compute_api/src/requests.rs. */
const COMPUTE_AUDIENCE = 'compute';
/** `ComputeClaimsScope::Admin`, serialized as "compute_ctl:admin". */
const COMPUTE_ADMIN_SCOPE = 'compute_ctl:admin';

/** compute_ctl checks `exp` when present, so admin tokens expire quickly. */
export const COMPUTE_ADMIN_TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Mints the bearer token for compute_ctl's external HTTP API (`:3080`).
 * `ComputeClaims` is `{compute_id?, scope?, aud?}`; compute_ctl's `Authorize`
 * middleware (compute_tools/src/http/middleware/authorize.rs) accepts the
 * admin scope only when `aud` contains "compute", and verifies the signature
 * against the JWKS delivered in `compute_ctl_config`.
 */
export function mintComputeAdminToken(
  signer: Ed25519Signer,
  computeId: string,
  now: Date = new Date(),
): string {
  if (computeId.length === 0) throw new Error('computeId must not be empty');
  const issuedAt = Math.floor(now.getTime() / 1000);
  return signer.sign({
    aud: [COMPUTE_AUDIENCE],
    scope: COMPUTE_ADMIN_SCOPE,
    compute_id: computeId,
    iat: issuedAt,
    exp: issuedAt + COMPUTE_ADMIN_TOKEN_TTL_SECONDS,
  });
}

/** Claims of the token a compute presents to fetch its own spec. */
export interface ComputeSpecClaims {
  tenantId: string;
  endpointId: string;
}

/**
 * Mints the `NEON_CONTROL_PLANE_TOKEN` of one compute pod. compute_ctl does not
 * look inside it: `get_config_from_control_plane` in compute_tools/src/spec.rs
 * only sends it as `Authorization: Bearer`. Neon's own convention (`Scope`
 * docs in libs/utils/src/auth.rs) is a `tenantendpoint` token, used only to
 * fetch the spec because the spec carries a tenant-scoped storage token.
 * `Claims.endpoint_id` is a UUID there, so the endpoint id travels in
 * `compute_id` (the name compute_ctl's own claims use for it) and the spec route
 * checks it against the id in the URL. Like the storage tokens it has no `exp`:
 * the pod holds it for its lifetime.
 */
export function mintComputeSpecToken(
  signer: Ed25519Signer,
  claims: ComputeSpecClaims,
  now: Date = new Date(),
): string {
  if (!isNeonId(claims.tenantId)) {
    throw new Error(
      `tenantId must be 32 hex characters, got ${claims.tenantId}`,
    );
  }
  if (!isEndpointId(claims.endpointId)) {
    throw new Error(`Not an endpoint id: ${claims.endpointId}`);
  }
  return signer.sign({
    scope: 'tenantendpoint',
    tenant_id: claims.tenantId,
    compute_id: claims.endpointId,
    iat: Math.floor(now.getTime() / 1000),
  });
}

/** The claims of a valid spec token, or null when the token is not one this key issued for a compute. */
export function verifyComputeSpecToken(
  signer: Ed25519Signer,
  token: string,
): ComputeSpecClaims | null {
  const claims = signer.verify(token);
  if (
    claims?.scope !== 'tenantendpoint' ||
    typeof claims.tenant_id !== 'string' ||
    typeof claims.compute_id !== 'string'
  ) {
    return null;
  }
  return { tenantId: claims.tenant_id, endpointId: claims.compute_id };
}
