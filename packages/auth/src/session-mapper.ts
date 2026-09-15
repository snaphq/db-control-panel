import type { UnifiedSession, UnifiedUser } from "./types";

function normalizeUser(user: {
  id: string;
  email: string;
  publicEmail?: string | null;
  tenantId?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string | null;
}): UnifiedUser {
  return {
    id: user.id,
    email: user.publicEmail ?? user.email,
    tenantId: user.tenantId ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
    role: user.role ?? null,
  };
}

export function mapBetterAuthSession(
  session:
    | {
        user?: {
          id: string;
          email: string;
          tenantId?: string | null;
          name?: string | null;
          image?: string | null;
          role?: string | null;
        } | null;
        expiresAt?: Date;
      }
    | null
    | undefined,
): UnifiedSession | null {
  if (!session || !session.user) {
    return null;
  }

  return {
    user: normalizeUser(session.user),
    expiresAt:
      session.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}
