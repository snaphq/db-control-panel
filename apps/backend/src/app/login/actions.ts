"use server";

import { logAdminAction } from "@/lib/admin-audit";
import { createAdminSession } from "@/lib/admin-auth";
import { requestAdminLoginCode, verifyAdminLoginCode } from "@/lib/admin-login";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = readField(formData, "email");
  if (!email.includes("@")) {
    return { step: "email", error: "Enter a valid email address." };
  }

  const code = readField(formData, "code");
  if (!code) {
    await requestAdminLoginCode(email);
    // Same response for unknown emails so the form cannot enumerate admins.
    return { step: "code", email };
  }

  const verifiedEmail = await verifyAdminLoginCode(email, code);
  if (!verifiedEmail) {
    return { step: "code", email, error: "Invalid or expired code." };
  }

  const requestHeaders = await headers();
  await createAdminSession(verifiedEmail, {
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? null,
    userAgent: requestHeaders.get("user-agent"),
  });
  await logAdminAction({ email: verifiedEmail }, "admin_signed_in");
  redirect("/dashboard");
}
