import {
  ANALYTICS_EVENTS,
  identifyServerUser,
  trackServerEvent,
} from "@repo/analytics";
import { baseServer } from "@repo/auth/server";
import { createReferral, getReferralCodeByCode } from "@repo/billing";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: { message: "Email, password, and name are required" } },
        { status: 400 },
      );
    }

    // Use better-auth's Response so the Set-Cookie session header is preserved.
    const authResponse = await baseServer.signUpEmailResponse({
      email,
      password,
      name,
      headers: await headers(),
    });

    // Best-effort analytics tracking — don't block sign-up on this.
    if (authResponse.ok) {
      try {
        const cloned = authResponse.clone();
        const data = (await cloned.json()) as { user?: { id?: string } };
        const userId = data?.user?.id;
        if (userId) {
          await identifyServerUser(userId, {
            email,
            name,
            signup_source: "email",
            signup_date: new Date().toISOString(),
          });

          await trackServerEvent(ANALYTICS_EVENTS.USER_CREATED, userId, {
            email,
            name,
            provider: "email",
          });

          // Best-effort referral attribution — never block sign-up on failure.
          try {
            const jar = await cookies();
            const referralCookie = jar.get("referral_code")?.value;
            if (referralCookie) {
              const referralCode = await getReferralCodeByCode(referralCookie);
              if (referralCode && referralCode.userId !== userId) {
                await createReferral({
                  codeId: referralCode.id,
                  referrerId: referralCode.userId,
                  refereeId: userId,
                });
                jar.delete("referral_code");
              }
            }
          } catch {
            // Referral attribution is non-critical; ignore all errors.
          }
        }
      } catch {
        // Ignore analytics failures.
      }
    }

    return authResponse;
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 },
    );
  }
}
