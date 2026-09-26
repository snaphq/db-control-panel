import { ProjectTable } from "@/components/admin/ProjectTable";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { OrgBillingForm } from "@/components/admin/billing/org-billing-form";
import { getOrgBilling } from "@repo/billing/get-org-billing";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { organization, planTier, project } from "@repo/database/schema";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getOrganization(id: string) {
  try {
    const [org] = await db()
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);
    return org || null;
  } catch (error) {
    console.error("Error fetching organization:", error);
    return null;
  }
}

async function getOrganizationProjects(organizationId: string) {
  try {
    const projects = await db()
      .select()
      .from(project)
      .where(eq(project.organizationId, organizationId));
    return projects;
  } catch (error) {
    console.error("Error fetching organization projects:", error);
    return [];
  }
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [organizationData, projects, billing, tiers] = await Promise.all([
    getOrganization(id),
    getOrganizationProjects(id),
    getOrgBilling(id),
    db().select().from(planTier),
  ]);

  if (!organizationData) {
    notFound();
  }

  tiers.sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-normal tracking-tight">
              Organization Details
            </h1>
            <p className="text-muted-foreground">
              View and edit organization information
            </p>
          </div>
          {organizationData.status === "suspended" && (
            <Badge variant="outline" className="ml-2">
              Archived
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/organizations">Back to Organizations</Link>
          </Button>
          <RowActionsMenu
            archived={organizationData.status === "suspended"}
            archiveUrl={`/api/admin/organizations/${organizationData.id}/archive`}
            unarchiveUrl={`/api/admin/organizations/${organizationData.id}/unarchive`}
            deleteUrl={`/api/admin/organizations/${organizationData.id}`}
          />
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Organization Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              ID
            </span>
            <p className="font-mono text-sm">{organizationData.id}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Name
            </span>
            <p>{organizationData.name}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Slug
            </span>
            <p className="font-mono">{organizationData.slug}</p>
          </div>
          {organizationData.logo && (
            <div>
              <span className="text-sm font-medium text-muted-foreground block">
                Logo
              </span>
              <p>{organizationData.logo}</p>
            </div>
          )}
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Created At
            </span>
            <p>{new Date(organizationData.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground block">
              Updated At
            </span>
            <p>{new Date(organizationData.updatedAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgBillingForm
            organizationId={organizationData.id}
            initial={{
              planTier: billing.planTier,
              planStatus: billing.planStatus,
              manualOverride: billing.manualOverride,
              notes: billing.notes,
              trialEndsAt: billing.trialEndsAt,
              stripeSubscriptionId: billing.stripeSubscriptionId,
              currentPeriodEnd: billing.currentPeriodEnd,
            }}
            tiers={tiers.map((t) => ({
              key: t.key,
              displayName: t.displayName,
              isPaid: t.isPaid,
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTable projects={projects} showOrganization={false} />
        </CardContent>
      </Card>
    </div>
  );
}
