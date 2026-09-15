import { AsyncLocalStorage } from "node:async_hooks";
import { resolveTenantFromHost } from "@repo/database";
import type {
  BetterAuthPlugin,
  DBAdapter,
  DBTransactionAdapter,
  Where,
} from "better-auth";

/**
 * Better Auth plugins write their models directly through the adapter without
 * receiving application-specific tenant fields. The route adapter installs
 * this context before invoking Better Auth so schema defaults can bind every
 * new auth row synchronously, before it can be consumed.
 */
export type AuthTenantContext = {
  tenantId: string;
  resource: string;
};

const authTenantStorage = new AsyncLocalStorage<AuthTenantContext>();

export function currentAuthTenantContext(): AuthTenantContext | null {
  return authTenantStorage.getStore() ?? null;
}

export function runWithAuthTenantContext<T>(
  context: AuthTenantContext,
  callback: () => T | Promise<T>,
): Promise<T> {
  if (typeof context?.tenantId !== "string" || !context.tenantId.trim()) {
    throw new Error("Better Auth requires an explicit tenant context");
  }
  if (typeof context?.resource !== "string" || !context.resource.trim()) {
    throw new Error("Better Auth requires an explicit OAuth resource context");
  }
  return authTenantStorage.run(context, async () => callback());
}

export function requiredAuthTenantId(): string {
  const tenantId = currentAuthTenantContext()?.tenantId;
  if (!tenantId) {
    throw new Error(
      "Better Auth organization writes require an explicit tenant context",
    );
  }
  return tenantId;
}

export function requiredAuthResource(): string {
  const resource = currentAuthTenantContext()?.resource;
  if (!resource) {
    throw new Error(
      "Better Auth OAuth writes require an explicit resource context",
    );
  }
  return resource;
}

const TENANT_BOUND_AUTH_MODELS = new Set([
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  "oauthApplication",
  "oauthAccessToken",
  "oauthConsent",
  "twoFactor",
  "passkey",
]);

const RESOURCE_BOUND_AUTH_MODELS = new Set([
  "oauthAccessToken",
  "oauthConsent",
]);

function isTenantBoundAuthModel(model: string): boolean {
  return TENANT_BOUND_AUTH_MODELS.has(model);
}

function isResourceBoundAuthModel(model: string): boolean {
  return RESOURCE_BOUND_AUTH_MODELS.has(model);
}

function assertBinding(
  model: string,
  field: "tenantId" | "resource",
  value: unknown,
  expected: string,
): void {
  if (value !== undefined && value !== expected) {
    throw new Error(
      `Better Auth ${model} ${field} does not match the request binding`,
    );
  }
}

function bindCreateData(
  model: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!isTenantBoundAuthModel(model)) return data;

  const context = currentAuthTenantContext();
  if (!context) {
    throw new Error(
      `Better Auth ${model} writes require an explicit tenant context`,
    );
  }
  assertBinding(model, "tenantId", data.tenantId, context.tenantId);

  const bound: Record<string, unknown> = {
    ...data,
    tenantId: context.tenantId,
  };
  if (isResourceBoundAuthModel(model)) {
    assertBinding(model, "resource", data.resource, context.resource);
    bound.resource = context.resource;
  }
  return bound;
}

function bindUpdateData(
  model: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!isTenantBoundAuthModel(model)) return data;

  const context = currentAuthTenantContext();
  if (!context) {
    throw new Error(
      `Better Auth ${model} writes require an explicit tenant context`,
    );
  }
  assertBinding(model, "tenantId", data.tenantId, context.tenantId);

  const bound: Record<string, unknown> = {
    ...data,
    tenantId: context.tenantId,
  };
  if (isResourceBoundAuthModel(model)) {
    assertBinding(model, "resource", data.resource, context.resource);
    bound.resource = context.resource;
  }
  return bound;
}

function bindWhere(
  model: string,
  where: Where[] | undefined,
): Where[] | undefined {
  if (!isTenantBoundAuthModel(model)) return where;

  const context = currentAuthTenantContext();
  if (!context) {
    throw new Error(
      `Better Auth ${model} reads require an explicit tenant context`,
    );
  }

  const bindings: Where[] = [
    {
      field: "tenantId",
      operator: "eq",
      value: context.tenantId,
      connector: "AND",
    },
  ];
  if (isResourceBoundAuthModel(model)) {
    bindings.push({
      field: "resource",
      operator: "eq",
      value: context.resource,
      connector: "AND",
    });
  }

  for (const condition of where ?? []) {
    if (condition.field === "tenantId") {
      if (
        (condition.operator ?? "eq") !== "eq" ||
        condition.value !== context.tenantId
      ) {
        throw new Error(
          `Better Auth ${model} tenantId query does not match the request binding`,
        );
      }
    }
    if (condition.field === "resource" && isResourceBoundAuthModel(model)) {
      if (
        (condition.operator ?? "eq") !== "eq" ||
        condition.value !== context.resource
      ) {
        throw new Error(
          `Better Auth ${model} resource query does not match the request binding`,
        );
      }
    }
  }

  return [...(where ?? []), ...bindings];
}

/**
 * Wrap a Better Auth adapter so every tenant-bound operation is bound to the
 * request context. This is intentionally below database hooks: OIDC and
 * organization plugins call `ctx.context.adapter` directly and therefore can
 * bypass application-specific hooks when creating their records.
 */
export function withTenantBoundAuthAdapter(adapter: DBAdapter): DBAdapter {
  const wrapped: DBAdapter = {
    ...adapter,
    create: async ({ model, data, select, forceAllowId }) =>
      adapter.create({
        model,
        data: bindCreateData(model, data),
        select,
        forceAllowId,
      }),
    findOne: async ({ model, where, select, join }) =>
      adapter.findOne({
        model,
        where: bindWhere(model, where) ?? [],
        select,
        join,
      }),
    findMany: async ({ model, where, limit, sortBy, offset, join }) =>
      adapter.findMany({
        model,
        where: bindWhere(model, where),
        limit,
        sortBy,
        offset,
        join,
      }),
    count: async ({ model, where }) =>
      adapter.count({ model, where: bindWhere(model, where) }),
    update: async ({ model, where, update }) =>
      adapter.update({
        model,
        where: bindWhere(model, where) ?? [],
        update: bindUpdateData(model, update),
      }),
    updateMany: async ({ model, where, update }) =>
      adapter.updateMany({
        model,
        where: bindWhere(model, where) ?? [],
        update: bindUpdateData(model, update),
      }),
    delete: async ({ model, where }) =>
      adapter.delete({ model, where: bindWhere(model, where) ?? [] }),
    deleteMany: async ({ model, where }) =>
      adapter.deleteMany({ model, where: bindWhere(model, where) ?? [] }),
    transaction: async (callback) =>
      adapter.transaction((transactionAdapter) =>
        callback(withTenantBoundTransactionAdapter(transactionAdapter)),
      ),
  };

  return wrapped;
}

function withTenantBoundTransactionAdapter(
  adapter: DBTransactionAdapter,
): DBTransactionAdapter {
  const wrapped = withTenantBoundAuthAdapter({
    ...adapter,
    transaction: async () => {
      throw new Error("Nested Better Auth transactions are not supported");
    },
  });
  const { transaction: _transaction, ...transactionAdapter } = wrapped;
  return transactionAdapter;
}

export function parseOAuthVerificationValue(
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isOAuthVerificationValue(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value.clientId === "string" &&
      typeof value.redirectURI === "string" &&
      Array.isArray(value.scope),
  );
}

export async function tenantIdForAuthContext(
  context: { request?: Request } | null | undefined,
): Promise<string | null> {
  const current = currentAuthTenantContext();
  if (current) return current.tenantId;
  const host = context?.request?.headers.get("host");
  if (!host) return null;
  const tenant = await resolveTenantFromHost(host);
  return tenant?.id ?? null;
}

export const tenantBoundAuthFields = {
  id: "tenant-bound-auth-fields",
  schema: {
    oauthApplication: {
      modelName: "oauthApplication",
      fields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
    oauthAccessToken: {
      modelName: "oauthAccessToken",
      fields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
        resource: {
          type: "string",
          required: false,
          input: false,
          returned: false,
          defaultValue: requiredAuthResource,
        },
        revokedAt: {
          type: "date",
          required: false,
          input: false,
          returned: false,
          defaultValue: null,
        },
      },
    },
    oauthConsent: {
      modelName: "oauthConsent",
      fields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
        resource: {
          type: "string",
          required: false,
          input: false,
          returned: false,
          defaultValue: requiredAuthResource,
        },
      },
    },
    twoFactor: {
      modelName: "twoFactor",
      fields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
    passkey: {
      modelName: "passkey",
      fields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
  },
} satisfies BetterAuthPlugin;

/**
 * The organization plugin creates organization/member/invitation rows through
 * its adapter. Keep the tenant field out of caller input and derive it from
 * the request context synchronously, just like the core Better Auth models.
 * The route adapters always install this context before invoking the plugin.
 */
export const tenantBoundOrganizationFields = {
  tenantId: {
    type: "string",
    required: true,
    input: false,
    returned: false,
    defaultValue: requiredAuthTenantId,
  },
} as const;
