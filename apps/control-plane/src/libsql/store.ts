import type { LibsqlState } from '../db/schema.js';
import type {
  DesiredStateChange,
  LibsqlDatabaseRow,
  NodeRow,
  OperationInput,
  Scope,
} from '../neon/store.js';
import type { OperationRecord } from '../operations/store.js';

/**
 * Persistence of libSQL databases. Reads for the console are scoped by both the
 * organization and the console project; the worker's reads act on ids the
 * control plane handed out. Mutations go through `commit`, which writes the
 * desired state and the operation in one transaction exactly like the Neon
 * store, so the one-active-operation-per-project lock covers both.
 */
export interface LibsqlStore {
  // ---- console API (scoped)
  list(scope: Scope): Promise<LibsqlDatabaseRow[]>;
  find(scope: Scope, id: string): Promise<LibsqlDatabaseRow | null>;
  /** A live database holding this namespace, in any organization. */
  findByNamespace(namespace: string): Promise<LibsqlDatabaseRow | null>;
  /** Live databases per node, for placement. */
  countByNode(): Promise<Map<number, number>>;
  listNodes(): Promise<NodeRow[]>;
  commit(
    scope: Scope,
    operation: OperationInput,
    changes: DesiredStateChange[],
  ): Promise<OperationRecord>;

  // ---- worker
  get(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<LibsqlDatabaseRow | null>;
  getNode(id: number): Promise<NodeRow | null>;
  setState(id: string, state: LibsqlState): Promise<void>;
}
