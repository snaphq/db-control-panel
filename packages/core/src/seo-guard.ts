import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { getSiteAdminStatus } from "./auth-utils";

export type SeoAccessMode = "read" | "read_write";

export interface SeoAccessContext {
  userId: string;
  email: string;
}

/**
 * Guard for /adminx/seo and /adminx/seo/aieo routes. Throws on denial so
 * server components can call it at the top of render without ceremony.
 *
 * Mirrors arb-dev's `ensureModuleAccess("seo", mode)` but backed by BetterAuth
 * site-admin role instead of arb-dev's role-based permissions table.
 */
export async function ensureSeoAccess(
  _mode: SeoAccessMode = "read",
): Promise<SeoAccessContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("SEO: not authenticated");
  }
  const isAdmin = await getSiteAdminStatus(session.user.id);
  if (!isAdmin) {
    throw new Error("SEO: forbidden");
  }
  return { userId: session.user.id, email: session.user.email };
}
