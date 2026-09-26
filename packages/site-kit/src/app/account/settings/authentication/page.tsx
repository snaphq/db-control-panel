import { requireSession } from "@repo/core/auth/require-membership";
import { db, eq } from "@repo/database";
import { account, user as userTable } from "@repo/database/schema";
import { ActiveSessionsCard } from "@repo/react-ui/components/account/authentication/active-sessions-card";
import { PasskeyCard } from "@repo/react-ui/components/account/authentication/passkey-card";
import { SignInMethodsCard } from "@repo/react-ui/components/account/authentication/sign-in-methods-card";
import { TwoFactorCard } from "@repo/react-ui/components/account/authentication/two-factor-card";

export const dynamic = "force-dynamic";

export default async function AuthenticationPage() {
  const { user } = await requireSession("/account/settings/authentication");

  const [accounts, userRows] = await Promise.all([
    db()
      .select({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, user.id)),
    db()
      .select({ twoFactorEnabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1),
  ]);

  const linked = {
    email: accounts.some((a) => a.providerId === "credential"),
    google: accounts.some((a) => a.providerId === "google"),
    github: accounts.some((a) => a.providerId === "github"),
  };

  const twoFactorEnabled = userRows[0]?.twoFactorEnabled ?? false;

  const googleEnabled = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );
  const githubEnabled = Boolean(
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET,
  );

  return (
    <div className="flex max-w-[800px] flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Authentication</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage how you sign in to your account.
        </p>
      </div>

      <SignInMethodsCard
        email={user.email}
        linked={linked}
        googleEnabled={googleEnabled}
        githubEnabled={githubEnabled}
      />

      <ActiveSessionsCard />

      <TwoFactorCard enabled={twoFactorEnabled} />

      <PasskeyCard />
    </div>
  );
}
