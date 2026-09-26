import { ReferralAdminPage } from "@/components/admin/referrals/ReferralAdminPage";
import { getReferralConfig, getReferralMetrics } from "@repo/billing";

export const dynamic = "force-dynamic";

export default async function AdminReferralsPage() {
  const [metrics, config] = await Promise.all([
    getReferralMetrics(),
    getReferralConfig(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Referrals</h1>
        <p className="text-muted-foreground">
          Manage referral codes, track conversions, and configure rewards.
        </p>
      </div>
      <ReferralAdminPage initialMetrics={metrics} initialConfig={config} />
    </div>
  );
}
