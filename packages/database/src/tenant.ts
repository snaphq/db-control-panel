import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "./client";
import { tenant, tenantDomain } from "./schema";

export const DEFAULT_TENANT_ID = "default";

function getDefaultTenantId() {
  return process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
}

export type TenantSeedInput = {
  id?: string;
  slug?: string;
  name?: string;
  platformName?: string;
  domain?: string;
  supportEmail?: string;
  logoUrl?: string;
  faviconUrl?: string;
};

export function normalizeTenantDomain(hostOrUrl: string | null | undefined) {
  if (!hostOrUrl) return null;
  const raw = hostOrUrl.trim().toLowerCase();
  if (!raw) return null;

  const hasScheme = raw.includes("://");
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? raw : `http://${raw}`);
  } catch {
    return null;
  }

  // A Host header is an authority, not a URL with userinfo. URL.host would
  // silently drop `foo@` and resolve that input as `tenant.example`, which can
  // select the wrong tenant. Reject credentials before returning the hostname.
  if (parsed.username || parsed.password) return null;
  // A bare Host authority must not contain URL path/query/fragment syntax.
  // Scheme-qualified environment URLs may include those parts because only
  // their authority is used for tenant lookup.
  if (!hasScheme && (parsed.pathname !== "/" || parsed.search || parsed.hash)) {
    return null;
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || /[\s\\/@?#]/.test(hostname)) return null;
  return hostname.replace(/\.$/, "");
}

/**
 * Normalize an actual HTTP Host authority.
 *
 * `normalizeTenantDomain` also accepts scheme-qualified environment URLs for
 * tenant seeding. Request headers are different: accepting a scheme or path
 * there would let a caller smuggle an URL through the host resolver and make
 * the request appear to belong to a known tenant. Keep the request boundary
 * strict while preserving the environment/configuration helper above.
 */
export function normalizeTenantHost(host: string | null | undefined) {
  const raw = host?.trim();
  if (!raw || raw.includes("://") || /[\s\\/@?#]/.test(raw)) return null;
  return normalizeTenantDomain(raw);
}

export function isLocalTenantHost(host: string | null | undefined) {
  const normalized = normalizeTenantHost(host);
  if (!normalized) return false;
  const unbracketed = normalized.replace(/^\[|\]$/g, "");
  return (
    unbracketed === "localhost" ||
    unbracketed === "127.0.0.1" ||
    unbracketed === "::1" ||
    unbracketed.endsWith(".localhost")
  );
}

export function buildTenantAuthEmail(tenantId: string, email: string) {
  return `${tenantId}:${email.trim().toLowerCase()}`;
}

export function readDefaultTenantSeedFromEnv(): Required<
  Pick<TenantSeedInput, "id" | "slug" | "name" | "platformName">
> &
  Omit<TenantSeedInput, "id" | "slug" | "name" | "platformName"> {
  const id = process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
  const name =
    process.env.DEFAULT_TENANT_NAME?.trim() ||
    process.env.DEFAULT_TENANT_PLATFORM_NAME?.trim() ||
    "Default Platform";

  return {
    id,
    slug: process.env.DEFAULT_TENANT_SLUG?.trim() || id,
    name,
    platformName: process.env.DEFAULT_TENANT_PLATFORM_NAME?.trim() || name,
    domain:
      normalizeTenantDomain(
        process.env.DEFAULT_TENANT_DOMAIN || process.env.NEXT_PUBLIC_APP_URL,
      ) ?? undefined,
    supportEmail: process.env.DEFAULT_TENANT_SUPPORT_EMAIL?.trim() || undefined,
    logoUrl: process.env.DEFAULT_TENANT_LOGO_URL?.trim() || undefined,
    faviconUrl: process.env.DEFAULT_TENANT_FAVICON_URL?.trim() || undefined,
  };
}

export async function ensureDefaultTenant(input: TenantSeedInput = {}) {
  const envSeed = readDefaultTenantSeedFromEnv();
  const seed = {
    ...envSeed,
    ...input,
    id: input.id || envSeed.id,
    slug: input.slug || envSeed.slug,
    name: input.name || envSeed.name,
    platformName: input.platformName || envSeed.platformName,
  };

  await db()
    .insert(tenant)
    .values({
      id: seed.id,
      slug: seed.slug,
      name: seed.name,
      platformName: seed.platformName,
      supportEmail: seed.supportEmail,
      logoUrl: seed.logoUrl,
      faviconUrl: seed.faviconUrl,
    })
    .onConflictDoUpdate({
      target: tenant.id,
      set: {
        slug: seed.slug,
        name: seed.name,
        platformName: seed.platformName,
        supportEmail: seed.supportEmail,
        logoUrl: seed.logoUrl,
        faviconUrl: seed.faviconUrl,
      },
    });

  const domain = normalizeTenantDomain(seed.domain);
  if (domain) {
    await db()
      .insert(tenantDomain)
      .values({
        id: randomUUID(),
        tenantId: seed.id,
        domain,
        isPrimary: true,
      })
      .onConflictDoUpdate({
        target: tenantDomain.domain,
        set: {
          tenantId: seed.id,
          isPrimary: true,
        },
      });
  }

  const [row] = await db()
    .select()
    .from(tenant)
    .where(eq(tenant.id, seed.id))
    .limit(1);
  return row;
}

/**
 * Tenant that local (localhost) requests resolve to during development. Each
 * site build pins SITE_TENANT_ID (each site's next.config.ts), so two sites
 * running on localhost resolve to their own tenants; scripts fall back to
 * DEFAULT_TENANT_ID.
 */
export function getLocalTenantId(): string {
  return process.env.SITE_TENANT_ID?.trim() || getDefaultTenantId();
}

export async function resolveTenantFromHost(host: string | null | undefined) {
  const normalized = normalizeTenantHost(host);

  // A missing or malformed Host header must never silently select the default
  // tenant. Every request-bound credential and session depends on this
  // resolution, so the absence of an explicit authority is an unknown host.
  if (!normalized) return null;

  const production =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  if (isLocalTenantHost(normalized)) {
    // Local aliases are a development convenience. A production request with
    // an arbitrary `*.localhost` Host must not select the default tenant or
    // become a server-side fetch target.
    if (production) return null;
    const localTenantId = getLocalTenantId();
    const [row] = await db()
      .select()
      .from(tenant)
      .where(
        and(
          eq(tenant.id, localTenantId),
          or(eq(tenant.status, "active"), eq(tenant.status, "readonly")),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  const [row] = await db()
    .select({ tenant })
    .from(tenantDomain)
    .innerJoin(tenant, eq(tenantDomain.tenantId, tenant.id))
    .where(
      and(
        eq(tenantDomain.domain, normalized ?? ""),
        or(eq(tenant.status, "active"), eq(tenant.status, "readonly")),
      ),
    )
    .limit(1);

  return row?.tenant ?? null;
}
