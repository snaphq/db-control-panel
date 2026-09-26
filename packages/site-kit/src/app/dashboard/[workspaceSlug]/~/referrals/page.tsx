import { auth } from "@repo/auth/server";
import { getReferralStats, isUserEligibleForReferralCode } from "@repo/billing";
import { ReferralDashboard } from "@repo/react-ui/components/referrals/ReferralDashboard";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function ReferralsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect(`/auth/sign-in?redirect=/dashboard/${workspaceSlug}/~/referrals`);
  }

  const userId = session.user.id;

  const [stats, eligible] = await Promise.all([
    getReferralStats(userId),
    isUserEligibleForReferralCode(userId),
  ]);

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[900px]">
      <div>
        <h2 className="font-semibold text-3xl tracking-tight">Referrals</h2>
        <p className="text-muted-foreground mt-1">
          Share your referral link and earn credits when friends upgrade.
        </p>
      </div>
      <ReferralDashboard stats={stats} eligible={eligible} userId={userId} />
    </div>
  );
}
