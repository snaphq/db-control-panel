import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { and, db, eq, normalizeTenantDomain } from "@repo/database";
import { tenant, tenantDomain } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function requireSiteAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!(await getSiteAdminStatus(session.user.id))) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const guard = await requireSiteAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await params;

  const [row] = await db()
    .select({
      tenant,
      domain: tenantDomain.domain,
    })
    .from(tenant)
    .leftJoin(
      tenantDomain,
      and(
        eq(tenantDomain.tenantId, tenant.id),
        eq(tenantDomain.isPrimary, true),
      ),
    )
    .where(eq(tenant.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const guard = await requireSiteAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const slug = body?.slug?.toString().trim().toLowerCase();
  const name = body?.name?.toString().trim();
  const platformName = body?.platformName?.toString().trim();
  const supportEmail = body?.supportEmail?.toString().trim() || null;
  const logoUrl = body?.logoUrl?.toString().trim() || null;
  const faviconUrl = body?.faviconUrl?.toString().trim() || null;
  const status = body?.status?.toString().trim();
  const domain = normalizeTenantDomain(body?.domain?.toString());

  if (!slug || !name || !platformName || !domain) {
    return NextResponse.json(
      { error: "slug, name, platformName, and domain are required" },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug may only contain lowercase letters, digits, and dashes" },
      { status: 400 },
    );
  }

  const [updated] = await db()
    .update(tenant)
    .set({
      slug,
      name,
      platformName,
      supportEmail,
      logoUrl,
      faviconUrl,
      status: status === "archived" ? "archived" : "active",
    })
    .where(eq(tenant.id, id))
    .returning();
  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db()
    .update(tenantDomain)
    .set({ isPrimary: false })
    .where(eq(tenantDomain.tenantId, id));
  await db()
    .insert(tenantDomain)
    .values({ id: nanoid(), tenantId: id, domain, isPrimary: true })
    .onConflictDoUpdate({
      target: tenantDomain.domain,
      set: { tenantId: id, isPrimary: true },
    });

  revalidatePath("/adminx/tenants");
  return NextResponse.json({ tenant: updated });
}
