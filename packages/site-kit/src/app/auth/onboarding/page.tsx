import { auth } from "@repo/auth/server";
import { getWorkspaceCount } from "@repo/core/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Check if user already has workspaces
  const orgCount = await getWorkspaceCount(session.user.id);

  // If user already has workspaces, redirect them to /workspace/new
  // where they can select a plan (including paid plans)
  if (orgCount > 0) {
    redirect("/workspace/new");
  }

  // New users without any workspace see the simple onboarding form
  // This creates a free workspace for first-time users
  return <OnboardingForm />;
}
