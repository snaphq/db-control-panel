import { auth } from "@repo/auth/server";
import { sha256Hex } from "@repo/core/agent-auth/keys";
import { db, resolveTenantFromHost } from "@repo/database";
import { user } from "@repo/database/schema";
import {
  agentClaimAttempt,
  agentProvider,
  agentRegistration,
} from "@repo/database/schema-agent-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClaimForm } from "./_components/claim-form";

export const dynamic = "force-dynamic";

interface ClaimPageProps {
  searchParams: Promise<{ claim_attempt_token?: string }>;
}

/**
 * /claim — user-facing half of the auth.md claim ceremony. The agent supplies
 * the claim_attempt_token via verification_uri (which routes through sign-in);
 * the user confirms the 6-digit user_code here. Agents never see this page.
 */
export default async function ClaimPage({ searchParams }: ClaimPageProps) {
  const { claim_attempt_token: attemptToken } = await searchParams;
  if (!attemptToken) {
    return (
      <ClaimShell title="Invalid link">
        <p className="text-sm text-muted-foreground">
          This claim link is missing its token. Ask your agent for a new code.
        </p>
      </ClaimShell>
    );
  }

  const requestHeaders = await headers();
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) {
    return (
      <ClaimShell title="Invalid link">
        <p className="text-sm text-muted-foreground">
          This link does not belong to a known tenant.
        </p>
      </ClaimShell>
    );
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    const returnTo = `/claim?claim_attempt_token=${encodeURIComponent(attemptToken)}`;
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(returnTo)}`);
  }

  const [claimingUser] = await db()
    .select({ tenantId: user.tenantId, archivedAt: user.archivedAt })
    .from(user)
    .where(
      and(
        eq(user.id, session.user.id),
        eq(user.tenantId, tenant.id),
        isNull(user.archivedAt),
      ),
    )
    .limit(1);
  if (!claimingUser) {
    return (
      <ClaimShell title="Account unavailable">
        <p className="text-sm text-muted-foreground">
          Sign in with an active account in this workspace to authorize the
          agent.
        </p>
      </ClaimShell>
    );
  }

  const [attempt] = await db()
    .select()
    .from(agentClaimAttempt)
    .where(
      and(
        eq(agentClaimAttempt.attemptTokenHash, sha256Hex(attemptToken)),
        eq(agentClaimAttempt.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!attempt) {
    return (
      <ClaimShell title="Invalid link">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find this claim attempt. Ask your agent for a new
          code.
        </p>
      </ClaimShell>
    );
  }

  const [registration] = await db()
    .select()
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.id, attempt.registrationId),
        eq(agentRegistration.tenantId, tenant.id),
      ),
    )
    .limit(1);

  if (!registration) {
    return (
      <ClaimShell title="Invalid link">
        <p className="text-sm text-muted-foreground">
          This claim attempt is no longer available. Ask your agent for a new
          code.
        </p>
      </ClaimShell>
    );
  }

  let providerName: string | null = null;
  if (registration?.providerId) {
    const [provider] = await db()
      .select({ displayName: agentProvider.displayName })
      .from(agentProvider)
      .where(
        and(
          eq(agentProvider.id, registration.providerId),
          eq(agentProvider.tenantId, tenant.id),
          eq(agentProvider.status, "active"),
        ),
      )
      .limit(1);
    providerName = provider?.displayName ?? null;
  }

  if (attempt.status === "completed") {
    return (
      <ClaimShell title="Already claimed">
        <p className="text-sm text-muted-foreground">
          This agent has already been authorized.
        </p>
      </ClaimShell>
    );
  }

  if (
    attempt.status !== "initiated" ||
    attempt.expiresAt.getTime() < Date.now()
  ) {
    return (
      <ClaimShell title="Code expired">
        <p className="text-sm text-muted-foreground">
          This code has expired. Ask your agent to issue a new one — it can
          re-initiate the claim without starting over.
        </p>
      </ClaimShell>
    );
  }

  const linkingCopy = providerName
    ? `${providerName} is asking to link this account so the agent it runs can act on your behalf.`
    : "Your AI agent asked to connect to this service on your behalf.";

  return (
    <ClaimShell title="Authorize your agent">
      <p className="text-sm text-muted-foreground">{linkingCopy}</p>
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code it showed you to authorize it.
      </p>
      <ClaimForm
        claimAttemptToken={attemptToken}
        signedInEmail={session.user.email}
      />
    </ClaimShell>
  );
}

function ClaimShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-normal tracking-tight">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
