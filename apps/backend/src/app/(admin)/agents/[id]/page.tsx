import { AgentForm } from "@/app/(admin)/agents/_components/agent-form";
import { agent, db, eq } from "@repo/database";
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

export default async function EditAgentPage({ params }: PageProps) {
  const { id } = await params;
  const [row] = await db()
    .select()
    .from(agent)
    .where(eq(agent.id, id))
    .limit(1);
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">{row.name}</h1>
        <p className="text-sm text-muted-foreground">
          Slug: <span className="font-mono">{row.slug}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentForm
            mode="edit"
            initial={{
              ...row,
              temperature:
                row.temperature !== null ? Number(row.temperature) : null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
