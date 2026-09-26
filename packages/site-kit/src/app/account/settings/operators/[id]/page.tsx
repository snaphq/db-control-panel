import { listUserOrganizations } from "@repo/core/auth/operator-token";
import { requireSession } from "@repo/core/auth/require-membership";
import {
  getOwnedOperatorDetail,
  listOperatorActivity,
  serializeOperatorActivity,
  serializeOperatorDetail,
} from "@repo/core/operators/detail";
import { getCurrentTenant } from "@repo/core/tenant";
import { ACTIVITY_LIMIT } from "@repo/ui/components/account/operators/format";
import { OperatorDetail } from "@repo/ui/components/account/operators/operator-detail";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OperatorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { user } = await requireSession(
    `/account/settings/operators/${encodeURIComponent(id)}`,
  );
  const tenant = await getCurrentTenant();
  const scope = { userId: user.id, tenantId: tenant.id, operatorId: id };

  const [detail, activity, organizations] = await Promise.all([
    getOwnedOperatorDetail(scope),
    listOperatorActivity({ ...scope, limit: ACTIVITY_LIMIT }),
    listUserOrganizations(tenant.id, user.id),
  ]);
  if (!detail) notFound();

  return (
    <div className="flex max-w-[900px] flex-col gap-6 px-4 pt-5 pb-20">
      <OperatorDetail
        initialOperator={serializeOperatorDetail(detail)}
        initialActivity={activity.map(serializeOperatorActivity)}
        organizations={organizations}
      />
    </div>
  );
}
