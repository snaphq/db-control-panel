"use client";

import type { ReactNode } from "react";

/**
 * AuthProviderWrapper for Better Auth
 *
 * Better Auth doesn't require a client-side provider wrapper.
 * It uses API routes and cookies for session management.
 */
export function AuthProviderWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
