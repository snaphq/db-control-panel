import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gte,
  isNotNull,
  sql,
} from "@repo/database";
import {
  type Referral,
  type ReferralCode,
  type ReferralConfig,
  type ReferralCreditGrant,
  member,
  orgBilling,
  organization,
  planTier as planTierTable,
  referralCodes,
  referralConfig,
  referralCreditGrants,
  referralLifecycleLog,
  referrals,
  user,
} from "@repo/database/schema";
import { stripe } from "../stripe/client";
import {
  GRANT_STATUS,
  type GrantStatus,
  REFERRAL_STATUS,
  type ReferralStatus,
  activateReferral,
} from "./core";

// ============================================================================
// Eligibility (gated by user's org plan tier)
// ============================================================================

export async function isUserEligibleForReferralCode(
  userId: string,
): Promise<boolean> {
  const cfg = await getReferralConfig();
  if (!cfg.enabled) return false;
  if (!cfg.minPlanTier) return true;

  const minTier = await db()
    .select({ sortOrder: planTierTable.sortOrder })
    .from(planTierTable)
    .where(eq(planTierTable.key, cfg.minPlanTier))
    .limit(1);
  if (!minTier[0]) return true;

  const eligible = await db()
    .select({ orgId: orgBilling.organizationId })
    .from(orgBilling)
    .innerJoin(planTierTable, eq(planTierTable.key, orgBilling.planTier))
    .innerJoin(member, eq(member.organizationId, orgBilling.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        gte(planTierTable.sortOrder, minTier[0].sortOrder),
        eq(orgBilling.planStatus, "active"),
      ),
    )
    .limit(1);

  return eligible.length > 0;
}

// ============================================================================
// Credit grants — idempotent reward ledger
// ============================================================================

export interface RecordCreditGrantOpts {
  referralId: string;
  recipientUserId: string;
  recipientRole: "referrer" | "referee";
  amountCents: number;
  currency: string;
  stripeCustomerId?: string | null;
  stripeInvoiceId?: string | null;
}

export async function recordCreditGrant(
  opts: RecordCreditGrantOpts,
): Promise<ReferralCreditGrant | null> {
  if (opts.stripeInvoiceId) {
    const existing = await db()
      .select()
      .from(referralCreditGrants)
      .where(
        and(
          eq(referralCreditGrants.stripeInvoiceId, opts.stripeInvoiceId),
          eq(referralCreditGrants.recipientRole, opts.recipientRole),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const { nanoid } = await import("nanoid");
  const inserted = await db()
    .insert(referralCreditGrants)
    .values({
      id: nanoid(),
      referralId: opts.referralId,
      recipientUserId: opts.recipientUserId,
      recipientRole: opts.recipientRole,
      amountCents: opts.amountCents,
      currency: opts.currency,
      stripeCustomerId: opts.stripeCustomerId ?? null,
      stripeInvoiceId: opts.stripeInvoiceId ?? null,
    })
    .onConflictDoNothing({
      target: [
        referralCreditGrants.stripeInvoiceId,
        referralCreditGrants.recipientRole,
      ],
    })
    .returning();
  return inserted[0] ?? null;
}

export async function applyCreditGrant(
  grantId: string,
): Promise<ReferralCreditGrant> {
  const claimed = await db()
    .update(referralCreditGrants)
    .set({ status: GRANT_STATUS.APPLYING })
    .where(
      and(
        eq(referralCreditGrants.id, grantId),
        eq(referralCreditGrants.status, GRANT_STATUS.PENDING),
      ),
    )
    .returning();

  if (!claimed[0]) throw new Error("grant_not_pending_or_not_found");
  const grant = claimed[0];

  let customerId = grant.stripeCustomerId;

  if (!customerId) {
    const ref = await db()
      .select({
        orgId: referrals.refereeOrganizationId,
        referrerId: referrals.referrerId,
      })
      .from(referrals)
      .where(eq(referrals.id, grant.referralId))
      .limit(1);

    const orgIdLookup =
      grant.recipientRole === "referee" ? ref[0]?.orgId : null;
    if (orgIdLookup) {
      const orgRow = await db()
        .select({ stripeCustomerId: organization.stripeCustomerId })
        .from(organization)
        .where(eq(organization.id, orgIdLookup))
        .limit(1);
      customerId = orgRow[0]?.stripeCustomerId ?? null;
    }
    if (!customerId && grant.recipientRole === "referrer") {
      const referrerOrgs = await db()
        .select({ stripeCustomerId: organization.stripeCustomerId })
        .from(organization)
        .innerJoin(member, eq(member.organizationId, organization.id))
        .where(
          and(
            eq(member.userId, grant.recipientUserId),
            isNotNull(organization.stripeCustomerId),
          ),
        )
        .orderBy(sql`CASE WHEN ${member.role} = 'owner' THEN 0 ELSE 1 END`)
        .limit(1);
      customerId = referrerOrgs[0]?.stripeCustomerId ?? null;
    }
  }

  if (!customerId) {
    await db()
      .update(referralCreditGrants)
      .set({
        status: GRANT_STATUS.PENDING,
        failureReason: "no_stripe_customer",
      })
      .where(eq(referralCreditGrants.id, grantId));
    throw new Error("no_stripe_customer_for_recipient");
  }

  try {
    const txn = await stripe.customers.createBalanceTransaction(customerId, {
      amount: -Math.abs(grant.amountCents),
      currency: grant.currency,
      description: `Referral credit (grant ${grant.id})`,
    });

    const applied = await db()
      .update(referralCreditGrants)
      .set({
        status: GRANT_STATUS.APPLIED,
        stripeCustomerId: customerId,
        stripeBalanceTransactionId: txn.id,
        appliedAt: new Date(),
      })
      .where(eq(referralCreditGrants.id, grantId))
      .returning();

    if (grant.recipientRole === "referrer") {
      const ref = await db()
        .select({ codeId: referrals.referralCodeId })
        .from(referrals)
        .where(eq(referrals.id, grant.referralId))
        .limit(1);
      if (ref[0]) {
        await db()
          .update(referralCodes)
          .set({
            totalCreditsEarned: sql`${referralCodes.totalCreditsEarned} + ${grant.amountCents}`,
          })
          .where(eq(referralCodes.id, ref[0].codeId));
      }
    }

    if (!applied[0]) throw new Error("grant_apply_returned_no_row");
    return applied[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await db()
      .update(referralCreditGrants)
      .set({ status: GRANT_STATUS.PENDING, failureReason: message })
      .where(eq(referralCreditGrants.id, grantId));
    throw error;
  }
}

export async function rejectCreditGrant(
  grantId: string,
  reason: string,
): Promise<ReferralCreditGrant> {
  const updated = await db()
    .update(referralCreditGrants)
    .set({ status: GRANT_STATUS.REJECTED, rejectedReason: reason })
    .where(
      and(
        eq(referralCreditGrants.id, grantId),
        eq(referralCreditGrants.status, GRANT_STATUS.PENDING),
      ),
    )
    .returning();
  if (!updated[0]) throw new Error("grant_not_pending_or_not_found");
  return updated[0];
}

// ============================================================================
// Settings (singleton row)
// ============================================================================

const REFERRAL_CONFIG_ID = "default";

export async function getReferralConfig(): Promise<ReferralConfig> {
  const rows = await db().select().from(referralConfig).limit(1);
  if (rows[0]) return rows[0];

  const inserted = await db()
    .insert(referralConfig)
    .values({
      id: REFERRAL_CONFIG_ID,
      enabled: false,
      referrerCreditAmount: 1000,
      refereeCreditAmount: 500,
      currency: "usd",
      minPlanTier: "tier1",
      autoApply: false,
      approvalWindowDays: 30,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const re = await db().select().from(referralConfig).limit(1);
  if (!re[0]) throw new Error("referral_config_init_failed");
  return re[0];
}

export async function updateReferralConfig(
  patch: Partial<{
    enabled: boolean;
    referrerCreditAmount: number;
    refereeCreditAmount: number;
    currency: string;
    minPlanTier: string;
    autoApply: boolean;
    approvalWindowDays: number;
  }>,
): Promise<ReferralConfig> {
  await getReferralConfig();
  const updated = await db().update(referralConfig).set(patch).returning();
  if (!updated[0]) throw new Error("referral_config_update_failed");
  return updated[0];
}

// ============================================================================
// Admin queries
// ============================================================================

export async function adminListReferralCodes(
  opts: {
    limit?: number;
    offset?: number;
    isActive?: boolean;
    search?: string;
  } = {},
): Promise<{
  rows: Array<ReferralCode & { ownerEmail: string | null }>;
  total: number;
}> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conditions = [];
  if (opts.isActive !== undefined)
    conditions.push(eq(referralCodes.isActive, opts.isActive));
  if (opts.search)
    conditions.push(sql`${referralCodes.code} ILIKE ${`%${opts.search}%`}`);
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db()
    .select({
      id: referralCodes.id,
      userId: referralCodes.userId,
      code: referralCodes.code,
      usageCount: referralCodes.usageCount,
      totalCreditsEarned: referralCodes.totalCreditsEarned,
      isActive: referralCodes.isActive,
      createdAt: referralCodes.createdAt,
      updatedAt: referralCodes.updatedAt,
      ownerEmail: user.publicEmail,
    })
    .from(referralCodes)
    .leftJoin(user, eq(user.id, referralCodes.userId))
    .where(where)
    .orderBy(desc(referralCodes.createdAt))
    .limit(limit)
    .offset(offset);

  const totalRows = await db()
    .select({ n: count() })
    .from(referralCodes)
    .where(where);
  return { rows, total: Number(totalRows[0]?.n ?? 0) };
}

export async function setReferralCodeActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await db()
    .update(referralCodes)
    .set({ isActive })
    .where(eq(referralCodes.id, id));
}

export async function adminListReferrals(
  opts: {
    limit?: number;
    offset?: number;
    status?: ReferralStatus;
  } = {},
): Promise<{ rows: Referral[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.status ? eq(referrals.status, opts.status) : undefined;
  const rows = await db()
    .select()
    .from(referrals)
    .where(where)
    .orderBy(desc(referrals.createdAt))
    .limit(limit)
    .offset(offset);
  const totalRows = await db()
    .select({ n: count() })
    .from(referrals)
    .where(where);
  return { rows, total: Number(totalRows[0]?.n ?? 0) };
}

export async function adminListCreditGrants(
  opts: {
    limit?: number;
    offset?: number;
    status?: GrantStatus;
  } = {},
): Promise<{ rows: ReferralCreditGrant[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.status
    ? eq(referralCreditGrants.status, opts.status)
    : undefined;
  const rows = await db()
    .select()
    .from(referralCreditGrants)
    .where(where)
    .orderBy(desc(referralCreditGrants.createdAt))
    .limit(limit)
    .offset(offset);
  const totalRows = await db()
    .select({ n: count() })
    .from(referralCreditGrants)
    .where(where);
  return { rows, total: Number(totalRows[0]?.n ?? 0) };
}

export async function getReferralMetrics(): Promise<{
  totalCodes: number;
  activeCodes: number;
  totalReferrals: number;
  convertedReferrals: number;
  totalCreditsAppliedCents: number;
  pendingGrants: number;
}> {
  const [codeCounts, referralCounts, creditSums, pendingGrantCount] =
    await Promise.all([
      db()
        .select({
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${referralCodes.isActive} THEN 1 ELSE 0 END)`,
        })
        .from(referralCodes),
      db()
        .select({
          total: count(),
          converted: sql<number>`SUM(CASE WHEN ${referrals.status} = 'converted' THEN 1 ELSE 0 END)`,
        })
        .from(referrals),
      db()
        .select({
          applied: sql<number>`COALESCE(SUM(${referralCreditGrants.amountCents}), 0)`,
        })
        .from(referralCreditGrants)
        .where(eq(referralCreditGrants.status, GRANT_STATUS.APPLIED)),
      db()
        .select({ n: count() })
        .from(referralCreditGrants)
        .where(eq(referralCreditGrants.status, GRANT_STATUS.PENDING)),
    ]);

  return {
    totalCodes: Number(codeCounts[0]?.total ?? 0),
    activeCodes: Number(codeCounts[0]?.active ?? 0),
    totalReferrals: Number(referralCounts[0]?.total ?? 0),
    convertedReferrals: Number(referralCounts[0]?.converted ?? 0),
    totalCreditsAppliedCents: Number(creditSums[0]?.applied ?? 0),
    pendingGrants: Number(pendingGrantCount[0]?.n ?? 0),
  };
}

// ============================================================================
// Cron helper — close out the refund window
// ============================================================================

export async function activateRipeRefundPeriodReferrals(): Promise<string[]> {
  const cfg = await getReferralConfig();
  const cutoff = new Date(
    Date.now() - cfg.approvalWindowDays * 24 * 60 * 60 * 1000,
  );

  const ripe = await db()
    .select({ id: referrals.id })
    .from(referrals)
    .innerJoin(
      referralLifecycleLog,
      eq(referralLifecycleLog.referralId, referrals.id),
    )
    .where(
      and(
        eq(referrals.status, REFERRAL_STATUS.REFUND_PERIOD),
        eq(referralLifecycleLog.toStatus, REFERRAL_STATUS.REFUND_PERIOD),
        sql`${referralLifecycleLog.createdAt} < ${cutoff}`,
      ),
    )
    .orderBy(asc(referrals.createdAt));

  const activated: string[] = [];
  for (const row of ripe) {
    const ok = await activateReferral(row.id, "cron");
    if (ok) activated.push(row.id);
  }
  return activated;
}
