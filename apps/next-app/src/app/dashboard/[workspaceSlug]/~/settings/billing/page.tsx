import { getCurrentTenant } from "@/lib/tenant";
import { auth } from "@repo/auth/server";
import {
  APP_SETTINGS_KEYS,
  BILLING_MANAGEMENT_ROLES,
  DEFAULT_ENTERPRISE_CONTACT_LINK,
  canDowngradeToFree,
  getAppSetting,
  getOrganizationPlan,
  getOrganizationStatus,
  getOrganizationTrialEndDate,
  getUsageSummary,
  isFreeTier,
  isOrganizationInTrial,
} from "@repo/billing";
import { getPricingTiers } from "@repo/billing/stripe/queries";
import type {
  BillingSubscriptionResponse,
  BillingUsageResponse,
  MemberRole,
} from "@repo/billing/types";
import { db } from "@repo/database";
import { and, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BillingSettings } from "./BillingSettings";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function BillingSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect(
      `/auth/sign-in?redirect=/dashboard/${workspaceSlug}/~/settings/billing`,
    );
  }
  const tenant = await getCurrentTenant();

  // Get organization by slug
  const org = await db()
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.tenantId, tenant.id),
        eq(organization.slug, workspaceSlug),
      ),
    )
    .limit(1);

  if (!org[0]) {
    notFound();
  }

  const orgId = org[0].id;

  // Check user membership and role
  const membership = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, orgId),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!membership[0]) {
    notFound();
  }

  const canManageBilling = BILLING_MANAGEMENT_ROLES.includes(
    membership[0].role as (typeof BILLING_MANAGEMENT_ROLES)[number],
  );

  // Fetch all billing data in parallel
  const [
    plan,
    status,
    isFree,
    isTrialing,
    trialEndsAt,
    usageSummary,
    downgradeCheck,
    pricingTiers,
    enterpriseLink,
  ] = await Promise.all([
    getOrganizationPlan(orgId),
    getOrganizationStatus(orgId),
    isFreeTier(orgId),
    isOrganizationInTrial(orgId),
    getOrganizationTrialEndDate(orgId),
    getUsageSummary(orgId),
    canDowngradeToFree(orgId),
    getPricingTiers(),
    getAppSetting(APP_SETTINGS_KEYS.ENTERPRISE_CONTACT_LINK),
  ]);

  const subscription: BillingSubscriptionResponse = {
    plan,
    status: status || "active",
    isFree,
    isTrialing,
    isReadOnly: status === "readonly",
    trialEndsAt: trialEndsAt?.toISOString(),
    canManageBilling,
  };

  const usage: BillingUsageResponse = {
    usage: usageSummary,
    canDowngradeToFree: downgradeCheck.canDowngrade,
    downgradeBlockers: downgradeCheck.blockers,
  };

  return (
    <div className="flex flex-wrap justify-start items-center gap-4 px-4 pt-5">
      <div className="flex flex-col gap-3 mb-20 w-full max-w-[900px]">
        <h2 className="mt-10 first:mt-0 pb-2 border-b w-full font-semibold text-3xl tracking-tight transition-colors scroll-m-20">
          Billing & Subscription
        </h2>
        <p className="text-muted-foreground mb-6">
          Manage your workspace subscription, view usage, and upgrade your plan.
        </p>
        <BillingSettings
          organizationId={orgId}
          organizationSlug={workspaceSlug}
          organizationName={org[0].name}
          subscription={subscription}
          usage={usage}
          pricingTiers={pricingTiers}
          canManageBilling={canManageBilling}
          enterpriseContactLink={
            enterpriseLink || DEFAULT_ENTERPRISE_CONTACT_LINK
          }
          billingDetails={{
            invoiceEmail: org[0].invoiceEmail ?? null,
            companyName: org[0].companyName ?? null,
            billingCountry: org[0].billingCountry ?? null,
            billingAddress: org[0].billingAddress ?? null,
            invoiceLanguage: org[0].invoiceLanguage ?? "en",
            invoicePurchaseOrder: org[0].invoicePurchaseOrder ?? null,
            taxIdType: org[0].taxIdType ?? null,
            taxIdValue: org[0].taxIdValue ?? null,
          }}
        />
      </div>
    </div>
  );
}
