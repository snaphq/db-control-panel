import { count, db, desc, eq, inArray } from "@repo/database";
import {
  orgAuditLogs,
  orgBilling,
  organization,
  planTier,
} from "@repo/database/schema";

/**
 * Read models for the dashboard.
 *
 * Every function takes an already-resolved `tenantId`. None of them accept one
 * that has not been through the request guard: the tenant is established once
 * in src/http/tenant-guard.ts and arrives as `c.env.tenant`, and these helpers
 * only ever narrow from there.
 *
 * `organization.tenantId` is the only tenant link on the billing and audit
 * tables, so anything touching those joins through `organizationId`. The audit
 * table carries no `tenant_id` column of its own, which is exactly why that
 * join is not optional.
 */

const LOGS_PAGE_SIZE = 50;

export async function getOverview(tenantId: string) {
  const [[orgTotals], [activity], planRows] = await Promise.all([
    db()
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.tenantId, tenantId)),
    db()
      .select({ value: count() })
      .from(orgAuditLogs)
      .innerJoin(organization, eq(orgAuditLogs.organizationId, organization.id))
      .where(eq(organization.tenantId, tenantId)),
    db()
      .select({
        tier: orgBilling.planTier,
        status: orgBilling.planStatus,
        organizations: count(),
      })
      .from(orgBilling)
      .innerJoin(organization, eq(orgBilling.organizationId, organization.id))
      .where(eq(organization.tenantId, tenantId))
      .groupBy(orgBilling.planTier, orgBilling.planStatus),
  ]);

  return {
    organizations: orgTotals?.value ?? 0,
    auditEvents: activity?.value ?? 0,
    plans: planRows
      .map((row) => ({
        tier: row.tier,
        status: row.status,
        organizations: row.organizations,
      }))
      .sort((a, b) => a.tier.localeCompare(b.tier)),
  };
}

export async function getLogs(tenantId: string, page: number) {
  const offset = Math.max(0, Math.trunc(page)) * LOGS_PAGE_SIZE;
  const entries = await db()
    .select({
      id: orgAuditLogs.id,
      action: orgAuditLogs.action,
      fromValue: orgAuditLogs.fromValue,
      toValue: orgAuditLogs.toValue,
      performedBy: orgAuditLogs.performedBy,
      createdAt: orgAuditLogs.createdAt,
      organization: organization.name,
    })
    .from(orgAuditLogs)
    .innerJoin(organization, eq(orgAuditLogs.organizationId, organization.id))
    .where(eq(organization.tenantId, tenantId))
    .orderBy(desc(orgAuditLogs.createdAt))
    .limit(LOGS_PAGE_SIZE)
    .offset(offset);

  return {
    entries,
    page: Math.max(0, Math.trunc(page)),
    pageSize: LOGS_PAGE_SIZE,
    hasMore: entries.length === LOGS_PAGE_SIZE,
  };
}

export async function getGo(tenantId: string) {
  const rows = await db()
    .select({
      organizationId: organization.id,
      organization: organization.name,
      slug: organization.slug,
      status: organization.status,
      // A tenant can hold an organization with no billing row yet, so the plan
      // columns are nullable and the UI shows that as "no plan".
      planTier: orgBilling.planTier,
      planStatus: orgBilling.planStatus,
      trialEndsAt: orgBilling.trialEndsAt,
      currentPeriodEnd: orgBilling.currentPeriodEnd,
      cancelAtPeriodEnd: orgBilling.cancelAtPeriodEnd,
      canceledAt: orgBilling.canceledAt,
      manualOverride: orgBilling.manualOverride,
    })
    .from(organization)
    .leftJoin(orgBilling, eq(orgBilling.organizationId, organization.id))
    .where(eq(organization.tenantId, tenantId))
    .orderBy(organization.name);

  const tiers = [
    ...new Set(
      rows
        .map((row) => row.planTier)
        .filter((tier): tier is string => Boolean(tier)),
    ),
  ];
  const tierDetails = tiers.length
    ? await db()
        .select({
          key: planTier.key,
          displayName: planTier.displayName,
          description: planTier.description,
          isPaid: planTier.isPaid,
          features: planTier.features,
        })
        .from(planTier)
        .where(inArray(planTier.key, tiers))
    : [];

  return {
    organizations: rows,
    tiers: tierDetails.sort((a, b) => a.key.localeCompare(b.key)),
  };
}
