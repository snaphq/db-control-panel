import type {
  PlatformOperationAction,
  SafekeeperDrainProgress,
  SafekeeperState,
  safekeeper,
} from '../db/schema.js';
import type { OperationPage } from '../operations/repository.js';
import type { OperationRecord } from '../operations/store.js';

export type SafekeeperRow = typeof safekeeper.$inferSelect;

/**
 * Platform operations are filed under one reserved console project and
 * organization. The operation table's "one active operation per console
 * project" index then makes them mutually exclusive without touching any real
 * project's lock, and no console caller can read them (reads are scoped by the
 * caller's own project and organization).
 */
export const PLATFORM_SCOPE = {
  orgId: '__platform__',
  consoleProjectId: '__platform__',
} as const;

/** Another platform operation (rebalance or spread) is already scheduling or running; HTTP 409. */
export class PlatformBusyError extends Error {
  constructor(readonly activeOperationId?: string) {
    super(
      `A platform operation is already active${
        activeOperationId ? ` (${activeOperationId})` : ''
      }; retry when it finishes`,
    );
    this.name = 'PlatformBusyError';
  }
}

interface PlatformListQuery {
  status?: 'active' | OperationRecord['status'];
  limit: number;
  cursor?: string;
}

/** Persistence of the platform plane: the safekeeper registry and platform operations. */
export interface PlatformStore {
  /** Every safekeeper ever created, retired ones included, by id. */
  listSafekeepers(): Promise<SafekeeperRow[]>;
  getSafekeeper(id: number): Promise<SafekeeperRow | null>;
  /**
   * Inserts a safekeeper in state `creating`. The id comes from an identity
   * column, so an id is never handed out twice, even after the row is retired.
   */
  createSafekeeper(input: {
    nodeId: number;
    nodeName: string;
    operationId: string | null;
  }): Promise<SafekeeperRow>;
  /** `retired` also stamps `retired_at`. */
  setSafekeeperState(id: number, state: SafekeeperState): Promise<void>;
  setSafekeeperDrain(
    id: number,
    drain: SafekeeperDrainProgress | null,
  ): Promise<void>;

  /** Throws {@link PlatformBusyError} while another platform operation is active. */
  createOperation(input: {
    action: PlatformOperationAction;
    params: Record<string, unknown>;
  }): Promise<OperationRecord>;
  findOperation(id: string): Promise<OperationRecord | null>;
  listOperations(query: PlatformListQuery): Promise<OperationPage>;
  /** The newest operation of an action, whatever its status. */
  latestOperation(
    action: PlatformOperationAction,
  ): Promise<OperationRecord | null>;
  hasActiveOperation(): Promise<boolean>;
}
