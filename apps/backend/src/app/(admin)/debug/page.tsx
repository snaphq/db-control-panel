import { getAllowedAdminEmails, requireAdmin } from "@/lib/admin-auth";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export default async function DebugPage() {
  const session = await requireAdmin();
  const allowlistSize = getAllowedAdminEmails().size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Debug Information
        </h1>
        <p className="text-muted-foreground">
          Your backend admin session and access configuration
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Admin ID" value={session.user.id} />
          <Field label="Email" value={session.user.email} />
          <Field
            label="Session expires"
            value={session.expiresAt.toISOString()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Allowlisted admins (BACKEND_ADMIN_EMAILS)"
            value={<Badge variant="secondary">{allowlistSize}</Badge>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
