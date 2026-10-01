import type { Ed25519Signer } from '../crypto/ed25519.js';
import {
  type ComputeConfigResponse,
  type DeltaOperation,
  type PageserverConnectionInfo,
  buildComputeConfig,
  locateToConnectionInfo,
} from './spec.js';
import type { StorconClient } from './storcon-client.js';
import type { NeonStore } from './store.js';

/** The endpoint does not exist, or it or its branch or project was deleted. */
export class EndpointNotFoundError extends Error {
  constructor(readonly endpointId: string) {
    super(`Endpoint ${endpointId} not found`);
    this.name = 'EndpointNotFoundError';
  }
}

export interface SpecOptions {
  /** Use this placement instead of asking the controller (notify-attach carries it). */
  pageservers?: PageserverConnectionInfo;
  deltaOperations?: DeltaOperation[];
}

export interface SpecService {
  /** The full config for an endpoint, read from the database and the storage controller. */
  forEndpoint(
    endpointId: string,
    options?: SpecOptions,
  ): Promise<ComputeConfigResponse>;
}

interface SpecServiceDeps {
  store: NeonStore;
  storcon: StorconClient;
  signer: Ed25519Signer;
}

export function createSpecService(deps: SpecServiceDeps): SpecService {
  return {
    async forEndpoint(endpointId, options = {}) {
      const context = await deps.store.getEndpointContext(endpointId);
      if (!context) throw new EndpointNotFoundError(endpointId);
      const [roles, databases, pageservers] = await Promise.all([
        deps.store.listBranchRoles(context.branch.id),
        deps.store.listBranchDatabases(context.branch.id),
        options.pageservers ??
          deps.storcon
            .locateTenant(context.project.tenantId)
            .then(locateToConnectionInfo),
      ]);
      return buildComputeConfig({
        ...context,
        roles,
        databases,
        pageservers,
        signer: deps.signer,
        deltaOperations: options.deltaOperations,
      });
    },
  };
}
