import { resolveTenantFromHost } from "@repo/database";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export async function getCurrentTenant() {
  const requestHeaders = await headers();
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) notFound();
  return tenant;
}

export async function getCurrentTenantId() {
  const tenant = await getCurrentTenant();
  return tenant.id;
}
