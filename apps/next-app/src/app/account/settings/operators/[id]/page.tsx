import { ACTIVITY_LIMIT } from "@/components/account/operators/format";
import { OperatorDetail } from "@/components/account/operators/operator-detail";
import { listUserOrganizations } from "@/lib/auth/operator-token";
import { requireSession } from "@/lib/auth/require-membership";
import {
  getOwnedOperatorDetail,
  listOperatorActivity,
  serializeOperatorActivity,
  serializeOperatorDetail,
} from "@/lib/operators/detail";
import { getCurrentTenant } from "@/lib/tenant";
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
