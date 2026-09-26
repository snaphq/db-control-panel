import { auth } from "@repo/auth/server";
import { canUserCreateFreeWorkspace } from "@repo/billing";
import { getPricingTiers } from "@repo/billing/stripe/queries";
import { CreateWorkspaceProvider } from "@repo/react-ui/components/workspace/create/CreateWorkspaceContext";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function NewWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/auth/sign-in?redirect=/workspace/new");
  }

  const [pricingTiers, canCreateFree] = await Promise.all([
    getPricingTiers(),
    canUserCreateFreeWorkspace(session.user.id),
  ]);

  return (
    <CreateWorkspaceProvider
      pricingTiers={pricingTiers}
      canCreateFree={canCreateFree}
      defaultOpen
    >
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        Opening workspace creation…
      </div>
    </CreateWorkspaceProvider>
  );
}
