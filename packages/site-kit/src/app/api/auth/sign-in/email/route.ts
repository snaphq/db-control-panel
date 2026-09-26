import { ANALYTICS_EVENTS, trackServerEvent } from "@repo/analytics";
import { baseServer } from "@repo/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: { message: "Email and password are required" } },
        { status: 400 },
      );
    }

    // Use better-auth's Response so the Set-Cookie session header is preserved.
    const authResponse = await baseServer.signInEmailResponse({
      email,
      password,
      headers: await headers(),
    });

    // Best-effort analytics tracking — don't block sign-in on this.
    if (authResponse.ok) {
      try {
        const cloned = authResponse.clone();
        const data = (await cloned.json()) as {
          user?: { id?: string };
        };
        const userId = data?.user?.id;
        if (userId) {
          await trackServerEvent(ANALYTICS_EVENTS.USER_LOGGED_IN, userId, {
            email,
            provider: "email",
          });
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
