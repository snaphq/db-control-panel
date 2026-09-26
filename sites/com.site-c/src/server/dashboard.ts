"use server";

import { resolveTenantFromHost } from "@repo/database";
import { getRequestEvent } from "solid-js/web";
import { getGo, getLogs, getOverview } from "./queries";

/**
 * The dashboard's data path.
 *
 * These run on the server and are called directly by the route components, so
 * there is no HTTP round trip and no server-side `fetch` of a relative URL —
 * which Node rejects, and which is why an earlier version of this site 500'd
 * on every page while the same endpoints answered fine when curled.
 *
 * Tenancy works the same way as the Hono surface: the tenant is resolved from
 * the request's Host header here and never accepted as an argument, so a
 * client cannot name another tenant. `getRequestEvent()` is the ambient
 * request inside a server function.
 */

async function requireTenantId(): Promise<string> {
  const host = getRequestEvent()?.request.headers.get("host") ?? null;
  const tenant = await resolveTenantFromHost(host);
  if (!tenant) throw new Error("Unknown tenant");
  return tenant.id;
}

export async function tenantInfo() {
  const host = getRequestEvent()?.request.headers.get("host") ?? null;
  const tenant = await resolveTenantFromHost(host);
  if (!tenant) throw new Error("Unknown tenant");
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
  };
}

export async function overviewData() {
  return getOverview(await requireTenantId());
}

export async function logsData(page: number) {
  return getLogs(await requireTenantId(), page);
}

export async function goData() {
  return getGo(await requireTenantId());
}
