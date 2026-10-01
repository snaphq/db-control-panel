import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { isEmailProviderConfigured, sendEmail } from "@repo/core/email";
import { and, db, desc, eq, gt, isNull, sql } from "@repo/database";
import { adminLoginCode } from "@repo/database/schema-admin";
import { nanoid } from "nanoid";
import { isAllowedAdminEmail, normalizeEmail } from "./admin-auth";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function getCodeSecret(): string {
  const secret = process.env.BACKEND_SESSION_SECRET;
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("BACKEND_SESSION_SECRET must be set in production");
  }
  return "backend-dev-only-secret";
}

function hashCode(email: string, code: string): string {
  return createHmac("sha256", getCodeSecret())
    .update(`${email}:${code}`)
    .digest("hex");
}

/**
 * Email a sign-in code. Always resolves the same way whether or not the
 * email is allowlisted, so the login form cannot be used to enumerate admins.
 */
export async function requestAdminLoginCode(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!isAllowedAdminEmail(email)) return;

  const [recent] = await db()
    .select({ createdAt: adminLoginCode.createdAt })
    .from(adminLoginCode)
    .where(
      and(
        eq(adminLoginCode.email, email),
        gt(adminLoginCode.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent) return;

  if (isProduction() && !isEmailProviderConfigured()) {
    // The development fallback logs emails to the console; never do that
    // with a live credential in production logs.
    console.error(
      "[backend] ZSEND_API_KEY is not configured; cannot send admin sign-in codes",
    );
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db()
    .insert(adminLoginCode)
    .values({
      id: nanoid(),
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

  await sendEmail({
    to: email,
    subject: "Your admin sign-in code",
    text: `Your admin sign-in code is ${code}.\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
  });
}

/** Consume a sign-in code. Returns the normalized email on success. */
export async function verifyAdminLoginCode(
  rawEmail: string,
  rawCode: string,
): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!isAllowedAdminEmail(email) || !/^\d{6}$/.test(code)) return null;

  const [latest] = await db()
    .select()
    .from(adminLoginCode)
    .where(
      and(
        eq(adminLoginCode.email, email),
        isNull(adminLoginCode.consumedAt),
        gt(adminLoginCode.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(adminLoginCode.createdAt))
    .limit(1);
  if (!latest || latest.attempts >= MAX_ATTEMPTS) return null;

  const expected = Buffer.from(latest.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await db()
      .update(adminLoginCode)
      .set({ attempts: sql`${adminLoginCode.attempts} + 1` })
      .where(eq(adminLoginCode.id, latest.id));
    return null;
  }

  const consumed = await db()
    .update(adminLoginCode)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(adminLoginCode.id, latest.id), isNull(adminLoginCode.consumedAt)),
    )
    .returning({ id: adminLoginCode.id });
  return consumed.length > 0 ? email : null;
}
