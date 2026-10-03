import { requireAdmin } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export default async function PlatformPage() {
  await requireAdmin();
  redirect("/platform/nodes");
}
