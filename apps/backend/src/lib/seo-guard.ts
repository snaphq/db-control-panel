import { getAdminSession } from "./admin-auth";

export type SeoAccessMode = "read" | "read_write";

export interface SeoAccessContext {
  userId: string;
  email: string;
}

/**
 * Guard for the SEO and AIEO admin screens. Throws on denial so server
 * components and actions can call it at the top without ceremony. Every
 * backend admin currently has full SEO access; `mode` is kept so a future
 * role model can narrow write access without touching call sites.
 */
export async function ensureSeoAccess(
  _mode: SeoAccessMode = "read",
): Promise<SeoAccessContext> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("SEO: not authenticated");
  }
  return { userId: session.user.id, email: session.user.email };
}
