/**
 * @repo/auth/server - Better Auth server implementation
 *
 * Direct export - no dynamic provider switching.
 */
import "server-only";

import {
  buildTenantAuthEmail,
  db,
  resolveTenantFromHost,
} from "@repo/database";
import { and, eq } from "@repo/database";
import * as schema from "@repo/database/schema";
import {
  type BetterAuthServerOptions,
  createAuthInstance,
  getAuthConfig,
  resourceForAuthHeaders,
} from "./auth-instance";
import { mapBetterAuthSession } from "./session-mapper";
import {
  currentAuthTenantContext,
  runWithAuthTenantContext,
} from "./tenant-binding";
import type { UnifiedSession } from "./types";

export type { BetterAuthServerOptions } from "./auth-instance";
export {
  currentAuthTenantContext,
  runWithAuthTenantContext,
  withTenantBoundAuthAdapter,
} from "./tenant-binding";

function getSiteAdminDomains(): Set<string> {
  const domainsEnv = process.env.ADMIN_EMAIL_DOMAINS;
  if (!domainsEnv) return new Set();
  return new Set(
    domainsEnv
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
  );
}

const SITE_ADMIN_DOMAINS = getSiteAdminDomains();

class BetterAuthServer {
  private authInstance;

  constructor(options?: BetterAuthServerOptions) {
    this.authInstance = createAuthInstance(options);
  }

  async getSession(headers: Headers): Promise<UnifiedSession | null> {
    const tenant = await resolveTenantFromHost(headers.get("host"));
    if (!tenant) return null;
    return runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: resourceForAuthHeaders(headers),
      },
      async () => {
        const session = await this.authInstance.api.getSession({ headers });
        if (!session) return null;
        const sessionTenantId = (
          session as { session?: { tenantId?: string | null } }
        ).session?.tenantId;
        if (sessionTenantId && sessionTenantId !== tenant.id) return null;
        const userId = session.user?.id;
        if (userId) {
          const [row] = await db()
            .select({
              archivedAt: schema.user.archivedAt,
              publicEmail: schema.user.publicEmail,
              tenantId: schema.user.tenantId,
            })
            .from(schema.user)
            .where(
              and(
                eq(schema.user.id, userId),
                eq(schema.user.tenantId, tenant.id),
              ),
            )
            .limit(1);
          if (row?.archivedAt) return null;
          if (!row || row.tenantId !== tenant.id || !session.user) return null;
          session.user.email = row.publicEmail;
          (session.user as { tenantId?: string }).tenantId = row.tenantId;
        }
        return mapBetterAuthSession(session);
      },
    );
  }

  /**
   * Next.js App Router handler for the auth API routes.
   *
   * `better-auth/next-js` is imported lazily so this module stays free of a
   * static Next.js dependency: a non-Next.js host can run the same Better Auth
   * instance, pass `authInstance.handler` straight to its own router, and
   * avoid pulling `next/headers` into its module graph.
   */
  async getApiHandler() {
    const { toNextJsHandler } = await import("better-auth/next-js");
    return toNextJsHandler(this.authInstance.handler);
  }

  getAuthInstance() {
    return this.authInstance;
  }

  async signInEmail(params: {
    email: string;
    password: string;
    tenantId?: string;
  }) {
    try {
      const tenantId = params.tenantId?.trim();
      if (!tenantId) {
        throw new Error("An explicit tenantId is required for sign in");
      }
      const ctx = await runWithAuthTenantContext(
        {
          tenantId,
          resource: new URL("/mcp", getAuthConfig().baseURL).toString(),
        },
        () =>
          this.authInstance.api.signInEmail({
            body: {
              email: buildTenantAuthEmail(tenantId, params.email),
              password: params.password,
            },
          }),
      );
      return { data: ctx, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to sign in",
          code: "SIGN_IN_FAILED",
        },
      };
    }
  }

  async signInEmailResponse(params: {
    email: string;
    password: string;
    headers?: Headers;
    tenantId?: string;
  }): Promise<Response> {
    const tenant = params.tenantId
      ? { id: params.tenantId }
      : await resolveTenantFromHost(params.headers?.get("host"));
    if (!tenant) {
      return new Response(JSON.stringify({ error: "tenant_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: new URL("/mcp", getAuthConfig().baseURL).toString(),
      },
      () =>
        this.authInstance.api.signInEmail({
          body: {
            email: buildTenantAuthEmail(tenant.id, params.email),
            password: params.password,
          },
          headers: params.headers,
          asResponse: true,
        }),
    );
  }

  async signUpEmail(params: {
    email: string;
    password: string;
    name: string;
    tenantId?: string;
  }) {
    try {
      const tenantId = params.tenantId?.trim();
      if (!tenantId) {
        throw new Error("An explicit tenantId is required for sign up");
      }
      const ctx = await runWithAuthTenantContext(
        {
          tenantId,
          resource: new URL("/mcp", getAuthConfig().baseURL).toString(),
        },
        () =>
          this.authInstance.api.signUpEmail({
            body: {
              email: buildTenantAuthEmail(tenantId, params.email),
              password: params.password,
              name: params.name,
            },
          }),
      );
      return { data: ctx, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to sign up",
          code: "SIGN_UP_FAILED",
        },
      };
    }
  }

  async signUpEmailResponse(params: {
    email: string;
    password: string;
    name: string;
    headers?: Headers;
    tenantId?: string;
  }): Promise<Response> {
    const tenant = params.tenantId
      ? { id: params.tenantId }
      : await resolveTenantFromHost(params.headers?.get("host"));
    if (!tenant) {
      return new Response(JSON.stringify({ error: "tenant_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return runWithAuthTenantContext(
      {
        tenantId: tenant.id,
        resource: new URL("/mcp", getAuthConfig().baseURL).toString(),
      },
      () =>
        this.authInstance.api.signUpEmail({
          body: {
            email: buildTenantAuthEmail(tenant.id, params.email),
            password: params.password,
            name: params.name,
          },
          headers: params.headers,
          asResponse: true,
        }),
    );
  }

  async signOut() {
    try {
      return { error: null };
    } catch (error) {
      return {
        error: {
          message:
            error instanceof Error ? error.message : "Failed to sign out",
          code: "SIGN_OUT_FAILED",
        },
      };
    }
  }

  async assignSiteAdminRoleIfEligible(params: {
    email: string;
    userId?: string;
    tenantId?: string;
    mappedSession?: UnifiedSession | null;
  }) {
    const domain = params.email.split("@")[1]?.toLowerCase() ?? "";
    if (!params.userId || !SITE_ADMIN_DOMAINS.has(domain)) {
      return;
    }

    const tenantId = params.tenantId ?? currentAuthTenantContext()?.tenantId;
    // Role assignment is a privileged mutation. If no tenant was carried by
    // the caller, do not fall back to a global user-id update that could
    // promote an account in an unrelated tenant.
    if (!tenantId) return;
    const where = and(
      eq(schema.user.id, params.userId),
      eq(schema.user.tenantId, tenantId),
    );
    await db().update(schema.user).set({ role: "site-admin" }).where(where);

    if (params.mappedSession?.user) {
      params.mappedSession.user.role = "site-admin";
    }
  }
}

// Singleton instance
let serverInstance: BetterAuthServer | null = null;

export function getBetterAuthServer(
  options?: BetterAuthServerOptions,
): BetterAuthServer {
  if (!serverInstance) {
    serverInstance = new BetterAuthServer(options);
  }
  return serverInstance;
}

// Convenience exports
export const auth = {
  api: {
    getSession: async (options: { headers: Headers }) => {
      const server = getBetterAuthServer();
      return server.getSession(options.headers);
    },
  },
};

export async function getSession(
  headers: Headers,
): Promise<UnifiedSession | null> {
  const server = getBetterAuthServer();
  return server.getSession(headers);
}

// Export mapper for use in other modules
export { mapBetterAuthSession };

// Export baseServer singleton for API routes
export const baseServer = {
  getApiHandler: async () => {
    const server = getBetterAuthServer();
    return server.getApiHandler();
  },
  signInEmail: async (params: {
    email: string;
    password: string;
    tenantId?: string;
  }) => {
    const server = getBetterAuthServer();
    return server.signInEmail(params);
  },
  signInEmailResponse: async (params: {
    email: string;
    password: string;
    headers?: Headers;
    tenantId?: string;
  }) => {
    const server = getBetterAuthServer();
    return server.signInEmailResponse(params);
  },
  signUpEmail: async (params: {
    email: string;
    password: string;
    name: string;
    tenantId?: string;
  }) => {
    const server = getBetterAuthServer();
    return server.signUpEmail(params);
  },
  signUpEmailResponse: async (params: {
    email: string;
    password: string;
    name: string;
    headers?: Headers;
    tenantId?: string;
  }) => {
    const server = getBetterAuthServer();
    return server.signUpEmailResponse(params);
  },
  signOut: async () => {
    const server = getBetterAuthServer();
    return server.signOut();
  },
  getSession: async (headers: Headers) => {
    const server = getBetterAuthServer();
    return server.getSession(headers);
  },
};
