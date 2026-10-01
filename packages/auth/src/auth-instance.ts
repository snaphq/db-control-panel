import { passkey } from "@better-auth/passkey";
import { buildTenantAuthEmail, db, eq } from "@repo/database";
import * as schema from "@repo/database/schema";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { oidcProvider, organization, twoFactor } from "better-auth/plugins";

import {
  currentAuthTenantContext,
  isOAuthVerificationValue,
  parseOAuthVerificationValue,
  requiredAuthTenantId,
  tenantBoundAuthFields,
  tenantBoundOrganizationFields,
  tenantIdForAuthContext,
  withTenantBoundAuthAdapter,
} from "./tenant-binding";

// Read admin domains from environment variable
function getSiteAdminDomains(): Set<string> {
  const domainsEnv = process.env.ADMIN_EMAIL_DOMAINS;
  if (!domainsEnv) return new Set();

  return new Set(
    domainsEnv
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

const SITE_ADMIN_DOMAINS = getSiteAdminDomains();

export interface BetterAuthServerOptions {
  sendPasswordResetEmail?: (params: {
    user: { email: string };
    url: string;
    token: string;
  }) => Promise<void>;
  checkPasswordResetRateLimit?: (
    email: string,
  ) => Promise<{ success: boolean }>;
  /**
   * How the auth response's `Set-Cookie` headers reach the client.
   *
   * `"next"` (the default) installs Better Auth's `nextCookies` plugin, which
   * re-applies them through Next's `cookies()` API. That is required under the
   * Next.js App Router and must stay the default so every existing site is
   * unaffected.
   *
   * `"response"` omits the plugin for hosts that return the Better Auth
   * `Response` straight to the client, where `Set-Cookie` needs no
   * re-application. Use it from a non-Next.js host.
   *
   * Known cost: the `nextCookies` import stays static so the plugins array can
   * be built synchronously, so `better-auth/next-js` and ~160KB of Next's edge
   * runtime are still bundled on the server. It is never executed under
   * `"response"` and never reaches the browser — the client bundle is clean.
   * Removing it would mean making plugin construction async for every caller.
   */
  cookieDelivery?: "next" | "response";
}

// Get auth config from environment
export function getAuthConfig() {
  const baseURL =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  if (production && !configuredSecret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production; refusing to start with a development secret",
    );
  }
  const secret = configuredSecret ?? "development-secret-change-me";

  return {
    baseURL: baseURL
      ? baseURL.startsWith("http")
        ? baseURL
        : `https://${baseURL}`
      : "http://localhost:3000",
    secret,
  };
}

export function resourceForAuthHeaders(headers: Headers): string {
  const config = getAuthConfig();
  const base = new URL(config.baseURL);
  const host = headers.get("host")?.trim();
  if (!host) return new URL("/mcp", base).toString();

  try {
    return new URL("/mcp", `${base.protocol}//${host}`).toString();
  } catch {
    return new URL("/mcp", base).toString();
  }
}

export function createAuthInstance(options?: BetterAuthServerOptions) {
  const config = getAuthConfig();
  const databaseAdapter = drizzleAdapter(db(), {
    provider: "pg",
    schema,
  });

  return betterAuth({
    appName: "AlloyDB",
    database: (adapterOptions: Parameters<typeof databaseAdapter>[0]) =>
      withTenantBoundAuthAdapter(databaseAdapter(adapterOptions)),
    secret: config.secret,
    baseURL: config.baseURL,
    user: {
      additionalFields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
        publicEmail: {
          type: "string",
          // The lifecycle hook derives this from the tenant-prefixed auth
          // email before persistence; it is not caller-supplied input.
          required: false,
          input: false,
          returned: true,
        },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
      additionalFields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
    account: {
      additionalFields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
    verification: {
      additionalFields: {
        tenantId: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: requiredAuthTenantId,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (sessionData, context) => {
            const userId = (sessionData as { userId?: string })?.userId;
            if (!userId) return;
            const [[row], tenantId] = await Promise.all([
              db()
                .select({
                  archivedAt: schema.user.archivedAt,
                  tenantId: schema.user.tenantId,
                })
                .from(schema.user)
                .where(eq(schema.user.id, userId))
                .limit(1),
              tenantIdForAuthContext(context),
            ]);
            if (
              !row ||
              row.archivedAt ||
              (tenantId !== null && row.tenantId !== tenantId)
            ) {
              throw new APIError("UNAUTHORIZED", {
                code: row?.archivedAt
                  ? "ACCOUNT_ARCHIVED"
                  : "TENANT_SESSION_MISMATCH",
                message: row?.archivedAt
                  ? "This account has been suspended. Reach out to support if you think this is an error."
                  : "This account is not active on the requested tenant.",
              });
            }
            return {
              data: {
                ...sessionData,
                tenantId: row.tenantId,
              },
            };
          },
        },
      },
      user: {
        create: {
          before: async (userData, context) => {
            const email = (userData as { email?: string }).email ?? "";
            const separator = email.indexOf(":");
            const encodedTenantId =
              separator > 0 ? email.slice(0, separator) : null;
            const requestTenantId = await tenantIdForAuthContext(context);
            if (
              encodedTenantId &&
              requestTenantId &&
              encodedTenantId !== requestTenantId
            ) {
              throw new APIError("UNAUTHORIZED", {
                code: "TENANT_USER_MISMATCH",
                message: "This account belongs to a different tenant.",
              });
            }
            if (!requestTenantId) {
              throw new APIError("UNAUTHORIZED", {
                code: "TENANT_CONTEXT_REQUIRED",
                message: "An explicit tenant context is required.",
              });
            }
            const tenantId = requestTenantId;
            const publicEmail =
              separator > 0 ? email.slice(separator + 1) : email;
            return {
              data: {
                ...userData,
                // Better Auth receives provider emails without the
                // application tenant prefix. Persist the canonical,
                // globally-unique auth address while keeping the original
                // address in the public projection. Without this rewrite,
                // social/OIDC sign-in could collide across tenants or leave
                // a user row that password sign-in can never resolve.
                email: buildTenantAuthEmail(tenantId, publicEmail),
                tenantId,
                publicEmail,
              },
            };
          },
        },
      },
      account: {
        create: {
          before: async (accountData, context) => {
            const userId = (accountData as { userId?: string }).userId;
            if (!userId) return;
            const [[row], tenantId] = await Promise.all([
              db()
                .select({ tenantId: schema.user.tenantId })
                .from(schema.user)
                .where(eq(schema.user.id, userId))
                .limit(1),
              tenantIdForAuthContext(context),
            ]);
            if (!row || (tenantId !== null && row.tenantId !== tenantId)) {
              throw new APIError("UNAUTHORIZED", {
                code: "TENANT_ACCOUNT_MISMATCH",
                message: "This account is not active on the requested tenant.",
              });
            }
            return {
              data: {
                ...accountData,
                tenantId: row.tenantId,
              },
            };
          },
        },
      },
      verification: {
        create: {
          before: async (verificationData, context) => {
            const value = parseOAuthVerificationValue(
              (verificationData as { value?: unknown }).value,
            );
            const tenantId = await tenantIdForAuthContext(context);
            if (isOAuthVerificationValue(value)) {
              if (!tenantId) return false;
              return {
                data: {
                  ...verificationData,
                  tenantId,
                  value: JSON.stringify({
                    ...value,
                    resource:
                      value.resource ??
                      currentAuthTenantContext()?.resource ??
                      null,
                  }),
                },
              };
            }
            if (tenantId) {
              return { data: { ...verificationData, tenantId } };
            }
          },
        },
        update: {
          before: async (verificationData, context) => {
            const value = parseOAuthVerificationValue(
              (verificationData as { value?: unknown }).value,
            );
            const tenantId = await tenantIdForAuthContext(context);
            if (isOAuthVerificationValue(value)) {
              if (!tenantId) return false;
              return {
                data: {
                  ...verificationData,
                  value: JSON.stringify({
                    ...value,
                    resource:
                      value.resource ??
                      currentAuthTenantContext()?.resource ??
                      null,
                  }),
                },
              };
            }
            if (
              tenantId &&
              "tenantId" in verificationData &&
              verificationData.tenantId !== tenantId
            ) {
              return false;
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url, token }) => {
        if (options?.checkPasswordResetRateLimit) {
          const rateLimit = await options.checkPasswordResetRateLimit(
            user.email,
          );
          if (!rateLimit.success) {
            console.log(`[Auth] Password reset rate limited for ${user.email}`);
            return;
          }
        }

        if (options?.sendPasswordResetEmail) {
          void options.sendPasswordResetEmail({
            user: { email: user.email },
            url,
            token,
          });
        } else {
          const production =
            process.env.NODE_ENV === "production" ||
            process.env.VERCEL_ENV === "production";
          if (production) {
            console.error(
              "[Auth] Password reset email provider is not configured; refusing to log reset credentials",
            );
          } else {
            console.log(
              `[Auth] Password reset requested for ${user.email}: ${url}`,
            );
          }
        }
      },
      password: {
        hash: async (password) => {
          return await bcrypt.hash(password, 10);
        },
        verify: async ({ hash, password }) => {
          return await bcrypt.compare(password, hash);
        },
      },
    },
    ...((process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET) ||
    (process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET)
      ? {
          socialProviders: {
            ...(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
            process.env.GOOGLE_CLIENT_SECRET
              ? {
                  google: {
                    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                  },
                }
              : {}),
            ...(process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID &&
            process.env.GITHUB_CLIENT_SECRET
              ? {
                  github: {
                    clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
                    clientSecret: process.env.GITHUB_CLIENT_SECRET,
                  },
                }
              : {}),
          },
        }
      : {}),
    plugins: [
      // Omitted for hosts that pass the Response through untouched; see
      // BetterAuthServerOptions.cookieDelivery.
      ...(options?.cookieDelivery === "response" ? [] : [nextCookies()]),
      organization({
        schema: {
          organization: {
            additionalFields: tenantBoundOrganizationFields,
          },
          member: {
            additionalFields: tenantBoundOrganizationFields,
          },
          invitation: {
            additionalFields: tenantBoundOrganizationFields,
          },
        },
      }),
      twoFactor(),
      passkey({
        rpName: "AlloyDB",
        rpID: process.env.PASSKEY_RP_ID,
        origin: process.env.NEXT_PUBLIC_APP_URL,
      }),
      oidcProvider({
        loginPage: "/auth/sign-in",
        consentPage: "/consent",
        allowDynamicClientRegistration: true,
        // MCP OAuth uses authorization-code + S256 PKCE only. Plain
        // challenges and implicit/client-credentials grants are not
        // acceptable for a user-bound protected resource.
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        scopes: ["api.read", "api.write"],
        storeClientSecret: "hashed",
        // Better Auth's canonical email is tenant-prefixed to preserve its
        // global uniqueness constraint. OIDC claims are a public protocol
        // boundary, so always project the user-facing address and never
        // leak the internal `<tenant>:<email>` value in an ID token.
        getAdditionalUserInfoClaim: (oidcUser, scopes) => {
          const rawEmail =
            typeof oidcUser.email === "string" ? oidcUser.email : "";
          const publicEmail =
            typeof oidcUser.publicEmail === "string" &&
            oidcUser.publicEmail.trim()
              ? oidcUser.publicEmail.trim()
              : rawEmail.includes(":")
                ? rawEmail.slice(rawEmail.indexOf(":") + 1)
                : rawEmail;
          const claims: Record<string, unknown> = {};
          if (scopes.includes("email") && publicEmail) {
            claims.email = publicEmail;
            claims.email_verified = oidcUser.emailVerified === true;
          }
          if (scopes.includes("profile")) {
            const name = typeof oidcUser.name === "string" ? oidcUser.name : "";
            const [givenName, ...familyName] = name.split(/\s+/);
            claims.name = name || null;
            claims.picture = oidcUser.image ?? null;
            claims.given_name = givenName || null;
            claims.family_name = familyName.join(" ") || null;
          }
          return claims;
        },
      }),
      tenantBoundAuthFields,
    ],
  });
}
