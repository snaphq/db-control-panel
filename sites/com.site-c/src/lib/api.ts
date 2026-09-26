import { createResource } from "solid-js";

/**
 * Fetches a dashboard read model from this site's own Hono API.
 *
 * The request carries no tenant parameter on purpose. The server resolves the
 * tenant from the Host header in src/http/tenant-guard.ts, so a page can only
 * ever display the tenant it was actually served to.
 */

type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

export type Overview = {
  organizations: number;
  auditEvents: number;
  plans: { tier: string; status: string; organizations: number }[];
};

type LogEntry = {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  performedBy: string;
  createdAt: string;
  organization: string;
};

type LogsPage = {
  entries: LogEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type GoOrganization = {
  organizationId: string;
  organization: string;
  slug: string;
  status: string;
  planTier: string | null;
  planStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  canceledAt: string | null;
  manualOverride: boolean | null;
};

export type GoData = {
  organizations: GoOrganization[];
  tiers: {
    key: string;
    displayName: string;
    description: string | null;
    isPaid: boolean;
    features: string[];
  }[];
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  return (await response.json()) as T;
}

const fetchTenant = () => get<TenantInfo>("/api/tenant");
export const fetchOverview = () => get<Overview>("/api/overview");
export const fetchLogs = (page: number) =>
  get<LogsPage>(`/api/logs?page=${page}`);
export const fetchGo = () => get<GoData>("/api/go");

export function useTenant() {
  return createResource<TenantInfo>(fetchTenant);
}
