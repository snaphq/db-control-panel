import { requireSession } from "@repo/core/auth/require-membership";
import { db, eq } from "@repo/database";
import { user } from "@repo/database/schema";
import { AccountSettingsForm } from "@repo/ui/components/account/account-settings-form";
import { notFound } from "next/navigation";

export default async function AccountSettingsPage() {
  const { user: sessionUser } = await requireSession("/account/settings");

  const [row] = await db()
    .select({
      id: user.id,
      name: user.name,
      email: user.publicEmail,
      image: user.image,
      username: user.username,
    })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);

  if (!row) notFound();

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-20 max-w-[800px]">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">General</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage how you appear across the platform.
        </p>
      </div>
      <AccountSettingsForm
        userId={row.id}
        initialName={row.name}
        initialUsername={row.username ?? ""}
        initialImage={row.image ?? ""}
        email={row.email}
      />
    </div>
  );
}
