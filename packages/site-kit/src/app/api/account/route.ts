import { auth } from "@repo/auth/server";
import { and, db, eq, ne } from "@repo/database";
import { user } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;

/**
 * GET /api/account
 * Returns the current user's profile fields.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [row] = await db()
    .select({
      id: user.id,
      name: user.name,
      email: user.publicEmail,
      image: user.image,
      username: user.username,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/**
 * PATCH /api/account
 * Update the current user's profile (name, image, username).
 */
export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const [currentUser] = await db()
    .select({ tenantId: user.tenantId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!currentUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { name, image, username } = body as {
    name?: unknown;
    image?: unknown;
    username?: unknown;
  };

  const update: Partial<typeof user.$inferInsert> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters." },
        { status: 400 },
      );
    }
    update.name = name.trim();
  }

  if (image !== undefined) {
    if (image !== null && typeof image !== "string") {
      return NextResponse.json(
        { error: "Image must be a URL string or null." },
        { status: 400 },
      );
    }
    if (typeof image === "string" && image.length > 2048) {
      return NextResponse.json(
        { error: "Image URL is too long." },
        { status: 400 },
      );
    }
    update.image = image as string | null;
  }

  if (username !== undefined) {
    if (username === null || username === "") {
      update.username = null;
    } else {
      if (typeof username !== "string") {
        return NextResponse.json(
          { error: "Username must be a string." },
          { status: 400 },
        );
      }
      const normalized = username.toLowerCase();
      if (!USERNAME_REGEX.test(normalized)) {
        return NextResponse.json(
          {
            error:
              "Username must be 3–32 characters: lowercase letters, numbers, underscores, dashes; must start and end alphanumeric.",
          },
          { status: 400 },
        );
      }
      const [conflict] = await db()
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.tenantId, currentUser.tenantId),
            eq(user.username, normalized),
            ne(user.id, userId),
          ),
        )
        .limit(1);
      if (conflict) {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 },
        );
      }
      update.username = normalized;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  try {
    const [updated] = await db()
      .update(user)
      .set(update)
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        name: user.name,
        email: user.publicEmail,
        image: user.image,
        username: user.username,
      });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (/unique/i.test(message)) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
