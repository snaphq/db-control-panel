import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { IntegrationForm } from "../_components/integration-form";

export default function NewIntegrationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">New integration</h1>
        <p className="text-sm text-muted-foreground">
          Add a new integration to the registry.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
