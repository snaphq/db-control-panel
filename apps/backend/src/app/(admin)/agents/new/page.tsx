import { AgentForm } from "@/app/(admin)/agents/_components/agent-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";

export default function NewAgentPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">
          Add a new AI agent to the registry.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
