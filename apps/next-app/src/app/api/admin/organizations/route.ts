import { auth } from "@repo/auth/server";
import { ORG_STATUS } from "@repo/billing/constants";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { and, db, eq, searchOrganizations } from "@repo/database";
import { member, organization, project, user } from "@repo/database/schema";
import { parseSearchQuery } from "@repo/search";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await getSiteAdminStatus(session.user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = new URL(request.url).searchParams.get("search")?.trim();
    const organizations = search
      ? (
          await searchOrganizations(null, {
            query: parseSearchQuery(search),
            limit: 100,
            offset: 0,
          })
        ).results
      : await db().select().from(organization).orderBy(organization.createdAt);

    return NextResponse.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await getSiteAdminStatus(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const name = (body?.name ?? "").toString().trim();
    const slug = (body?.slug ?? "").toString().trim().toLowerCase();
    const ownerUserId = (body?.ownerUserId ?? "").toString();
    const tenantId = (body?.tenantId ?? "default").toString().trim();

    if (!name || !slug || !ownerUserId || !tenantId) {
      return NextResponse.json(
        { error: "name, slug, ownerUserId, and tenantId are required" },
        { status: 400 },
      );
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        {
          error: "slug may only contain lowercase letters, digits, and dashes",
        },
        { status: 400 },
      );
    }

    const [owner] = await db()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, ownerUserId), eq(user.tenantId, tenantId)))
      .limit(1);
    if (!owner) {
      return NextResponse.json(
        { error: "Owner user not found" },
        { status: 404 },
      );
    }

    const existing = await db()
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(eq(organization.tenantId, tenantId), eq(organization.slug, slug)),
      )
      .limit(1);
    if (existing[0]) {
      return NextResponse.json(
        { error: "An organization with this slug already exists" },
        { status: 409 },
      );
    }

    const orgId = nanoid();
    await db().insert(organization).values({
      id: orgId,
      tenantId,
      name,
      slug,
      status: ORG_STATUS.ACTIVE,
    });
    await db().insert(member).values({
      id: nanoid(),
      tenantId,
      organizationId: orgId,
      userId: ownerUserId,
      role: "owner",
    });
    await db().insert(project).values({
      id: nanoid(),
      tenantId,
      name: "Default Project",
      slug: "default",
      organizationId: orgId,
      isDefault: true,
    });

    revalidatePath("/adminx/organizations");
    return NextResponse.json(
      { organization: { id: orgId, name, slug } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating organization:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create organization", message },
      { status: 500 },
    );
  }
}
