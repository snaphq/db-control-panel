import { IntegrationForm } from "@/app/(admin)/integrations/_components/integration-form";
import { db, eq } from "@repo/database";
import { integration, integrationInstallation } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditIntegrationPage({ params }: PageProps) {
  const { id } = await params;
  const [row] = await db()
    .select()
    .from(integration)
    .where(eq(integration.id, id))
    .limit(1);
  if (!row) notFound();

  const installs = await db()
    .select({ id: integrationInstallation.id })
    .from(integrationInstallation)
    .where(eq(integrationInstallation.integrationId, id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">{row.name}</h1>
          <p className="text-sm text-muted-foreground">
            Slug: <span className="font-mono">{row.slug}</span>
          </p>
        </div>
        <Badge variant="outline">{installs.length} installation(s)</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationForm
            mode="edit"
            initial={row}
            installCount={installs.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}
