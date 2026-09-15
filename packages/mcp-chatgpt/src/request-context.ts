import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context stored in AsyncLocalStorage so tool handlers and
 * the logger can access the current request's identity without relying on
 * module-level singletons (which leak across concurrent requests on a warm
 * Node process).
 */
export interface McpRequestContext {
  requestId: string;
  userId?: string;
  orgId?: string;
  tenantId?: string;
  projectId?: string;
  actorId?: string;
  actorType?: "human" | "internal_agent" | "external_agent" | "system";
  /** Set only after the owning route has completed its admin authorization. */
  isAdmin?: boolean;
  credentialId?: string;
  authMethod?:
    | "session"
    | "account_token"
    | "oauth"
    | "agent_jwt"
    | "development";
  scopes?: string[];
  resource?: string;
}

const storage = new AsyncLocalStorage<McpRequestContext>();

/**
 * Run `fn` with the given context bound to the current async call chain.
 * All `await`-ed work inside `fn` (including inside tool handlers) will see
 * this context via `getCurrentMcpContext()`.
 */
export function runWithMcpContext<T>(
  ctx: McpRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

/**
 * Read the current request's context. Returns `undefined` when called
 * outside of a `runWithMcpContext` call chain (e.g. during startup).
 */
export function getCurrentMcpContext(): McpRequestContext | undefined {
  return storage.getStore();
}
