import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/auth/require-membership";
import { getCurrentTenant } from "@/lib/tenant";
import {
  getOrgBilling,
  getPlanTierDisplay,
} from "@repo/billing/get-org-billing";
import { and, db, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountBillingPage() {
  const { user } = await requireSession("/account/billing");
  const tenant = await getCurrentTenant();

  const memberships = await db()
    .select({
      orgId: organization.id,
      orgName: organization.name,
      orgSlug: organization.slug,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, user.id),
        eq(member.tenantId, tenant.id),
        eq(organization.tenantId, tenant.id),
      ),
    );

  const rows = await Promise.all(
    memberships.map(async (m) => {
      try {
        const billing = await getOrgBilling(m.orgId);
        const tier = await getPlanTierDisplay(billing.planTier);
        return {
          ...m,
          tierKey: billing.planTier,
          tierName: tier?.displayName ?? billing.planTier,
          status: billing.planStatus,
        };
      } catch {
        return {
          ...m,
          tierKey: "free",
          tierName: "Free",
          status: "active",
        };
      }
    }),
  );

  return (
    <div className="flex max-w-[800px] flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage billing for organizations you belong to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your organizations</CardTitle>
          <CardDescription>
            Each organization has its own billing. Click an organization to
            manage its plan and payment methods.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              You aren&apos;t a member of any organization yet.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.orgId}>
                  <Link
                    href={`/dashboard/${row.orgSlug}/~/settings/billing`}
                    className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {row.orgName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.orgSlug}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{row.tierName}</Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
