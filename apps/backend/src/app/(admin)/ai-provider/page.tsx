import { AiProviderForm } from "@/app/(admin)/ai-provider/_components/ai-provider-form";
import { getOpenAIConfigMasked } from "@repo/core/ai-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminAiProviderPage() {
  const config = await getOpenAIConfigMasked();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">AI Provider</h1>
        <p className="text-sm text-muted-foreground">
          Configure the OpenAI-compatible provider used for agent sessions.
          Values are stored in the database and apply immediately — no redeploy
          required.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OpenAI configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <AiProviderForm initial={config} />
        </CardContent>
      </Card>
    </div>
  );
}
