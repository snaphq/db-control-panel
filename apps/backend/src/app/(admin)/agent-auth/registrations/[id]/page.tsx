import { RegistrationActions } from "@/app/(admin)/agent-auth/registrations/[id]/_components/registration-actions";
import {
  agentAuthAudit,
  agentClaimAttempt,
  agentProvider,
  agentRegistration,
  agentToken,
  db,
  desc,
  eq,
  organization,
  user,
} from "@repo/database";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  unclaimed:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  claimed:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  expired: "border-transparent bg-secondary text-secondary-foreground",
  revoked: "border-transparent bg-destructive/15 text-destructive",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function Field({
  label,
  children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">{children}</dd>
    </div>
  );
}

function formatDate(value: Date | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default async function AgentRegistrationDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

  const [row] = await db()
    .select({
      reg: agentRegistration,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      orgName: organization.name,
      providerName: agentProvider.displayName,
      providerIssuer: agentProvider.issuer,
    })
    .from(agentRegistration)
    .leftJoin(user, eq(agentRegistration.userId, user.id))
    .leftJoin(
      organization,
      eq(agentRegistration.organizationId, organization.id),
    )
    .leftJoin(agentProvider, eq(agentRegistration.providerId, agentProvider.id))
    .where(eq(agentRegistration.id, id))
    .limit(1);
  if (!row) notFound();
  const reg = row.reg;

  let claimAttempts: Array<typeof agentClaimAttempt.$inferSelect> = [];
  let tokens: Array<typeof agentToken.$inferSelect> = [];
  let audit: Array<typeof agentAuthAudit.$inferSelect> = [];
  try {
    [claimAttempts, tokens, audit] = await Promise.all([
      db()
        .select()
        .from(agentClaimAttempt)
        .where(eq(agentClaimAttempt.registrationId, id))
        .orderBy(desc(agentClaimAttempt.createdAt))
        .limit(50),
      db()
        .select()
        .from(agentToken)
        .where(eq(agentToken.registrationId, id))
        .orderBy(desc(agentToken.createdAt))
        .limit(50),
      db()
        .select()
        .from(agentAuthAudit)
        .where(eq(agentAuthAudit.registrationId, id))
        .orderBy(desc(agentAuthAudit.createdAt))
        .limit(100),
    ]);
  } catch (error) {
    console.error("Error fetching registration relations:", error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">
            Registration <span className="font-mono text-lg">{reg.id}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant="outline"
              className={`capitalize ${STATUS_STYLES[reg.status] ?? ""}`}
            >
              {reg.status}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {reg.type}
            </Badge>
            <span className="text-sm text-muted-foreground">
              created {formatDate(reg.createdAt)}
            </span>
          </div>
        </div>
        <RegistrationActions id={reg.id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Registration ID">
                <span className="font-mono text-xs">{reg.id}</span>
              </Field>
              <Field label="Tenant ID">
                <span className="font-mono text-xs">{reg.tenantId}</span>
              </Field>
              <Field label="Type">{reg.type}</Field>
              <Field label="Status">{reg.status}</Field>
              <Field label="Created">{formatDate(reg.createdAt)}</Field>
              <Field label="Updated">{formatDate(reg.updatedAt)}</Field>
              <Field label="Created by agent">
                {reg.createdByAgent ? "Yes" : "No"}
              </Field>
              <Field label="Last poll">{formatDate(reg.lastPollAt)}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Binding</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Bound user">
                {reg.userId ? (
                  <Link
                    href={`/users/${reg.userId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.userEmail || reg.userId}
                    {row.userName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {row.userName}
                      </span>
                    ) : null}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unbound</span>
                )}
              </Field>
              <Field label="First linked">
                {formatDate(reg.firstLinkedAt)}
              </Field>
              <Field label="Organization">{row.orgName || "—"}</Field>
              <Field label="Claim email">{reg.claimEmail || "—"}</Field>
              <Field label="Provider">
                {reg.providerId
                  ? `${row.providerName || reg.providerId}${
                      row.providerIssuer ? ` (${row.providerIssuer})` : ""
                    }`
                  : "—"}
              </Field>
              <Field label="Issuer / subject">
                {reg.issuer ? `${reg.issuer} · ${reg.subject || "—"}` : "—"}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Claim window</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Registration expires">
                {formatDate(reg.registrationExpiresAt)}
              </Field>
              <Field label="Claim expires">
                {formatDate(reg.claimExpiresAt)}
              </Field>
              <Field label="Claim token expires">
                {formatDate(reg.claimTokenExpiresAt)}
              </Field>
              <Field label="Assertion expires">
                {formatDate(reg.assertionExpiresAt)}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scopes &amp; request</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Scopes">
                <span className="font-mono text-xs">{reg.scopes}</span>
              </Field>
              <Field label="Pre-claim scopes">
                <span className="font-mono text-xs">{reg.preClaimScopes}</span>
              </Field>
              <Field label="Post-claim scopes">
                <span className="font-mono text-xs">{reg.postClaimScopes}</span>
              </Field>
              <Field label="Last token issued">
                {formatDate(reg.lastTokenIssuedAt)}
              </Field>
              <Field label="Registration IP">
                <span className="font-mono text-xs">
                  {reg.registrationIp || "—"}
                </span>
              </Field>
              <Field label="User agent">
                <span className="text-xs">{reg.userAgent || "—"}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {reg.metadata != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {JSON.stringify(reg.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim attempts</CardTitle>
          <CardDescription>
            RFC 8628-shaped user code ceremonies for this registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claimAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No claim attempts.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Status
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Failed attempts
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Expires
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {claimAttempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle text-sm capitalize">
                        {attempt.status}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {attempt.failedAttempts}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {formatDate(attempt.expiresAt)}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {formatDate(attempt.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issued tokens</CardTitle>
          <CardDescription>
            Access token ledger for this registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens issued.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      JTI
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Scope
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Expires
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Revoked
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr
                      key={token.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle font-mono text-xs">
                        {token.jti.slice(0, 16)}…
                      </td>
                      <td className="p-4 align-middle font-mono text-xs">
                        {token.scope}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {formatDate(token.expiresAt)}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {token.revokedAt ? (
                          <span className="text-destructive">
                            {formatDate(token.revokedAt)}
                          </span>
                        ) : (
                          <Badge variant="outline">Active</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
          <CardDescription>
            Every state change recorded for this registration (latest 100).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Event
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Email
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Created
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle font-mono text-xs">
                        {event.event}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {event.email || "—"}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {formatDate(event.createdAt)}
                      </td>
                      <td className="p-4 align-middle font-mono text-xs">
                        {event.ip || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
