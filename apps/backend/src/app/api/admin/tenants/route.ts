import { getAdminSession } from "@/lib/admin-auth";
import { db, eq, normalizeTenantDomain, or } from "@repo/database";
import { tenant, tenantDomain } from "@repo/database/schema";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

async function requireSiteAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if ("error" in guard) return guard.error;

  const rows = await db()
    .select({
      tenant,
      domain: tenantDomain.domain,
    })
    .from(tenant)
    .leftJoin(tenantDomain, eq(tenantDomain.tenantId, tenant.id))
    .orderBy(tenant.createdAt);

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const guard = await requireSiteAdmin();
  if ("error" in guard) return guard.error;

  const body = await request.json().catch(() => null);
  const id = (body?.id ?? "").toString().trim() || nanoid();
  const slug = (body?.slug ?? "").toString().trim().toLowerCase();
  const name = (body?.name ?? "").toString().trim();
  const platformName = (body?.platformName ?? "").toString().trim();
  const domain = normalizeTenantDomain((body?.domain ?? "").toString());
  const supportEmail = (body?.supportEmail ?? "").toString().trim() || null;
  const logoUrl = (body?.logoUrl ?? "").toString().trim() || null;
  const faviconUrl = (body?.faviconUrl ?? "").toString().trim() || null;

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

  const [existingTenant] = await db()
    .select({ id: tenant.id })
    .from(tenant)
    .where(or(eq(tenant.id, id), eq(tenant.slug, slug)))
    .limit(1);
  if (existingTenant) {
    return NextResponse.json(
      { error: "A tenant with this ID or slug already exists" },
      { status: 409 },
    );
  }

  const [existingDomain] = await db()
    .select({ id: tenantDomain.id })
    .from(tenantDomain)
    .where(eq(tenantDomain.domain, domain))
    .limit(1);
  if (existingDomain) {
    return NextResponse.json(
      { error: "A tenant domain with this hostname already exists" },
      { status: 409 },
    );
  }

  await db().insert(tenant).values({
    id,
    slug,
    name,
    platformName,
    supportEmail,
    logoUrl,
    faviconUrl,
  });
  await db().insert(tenantDomain).values({
    id: nanoid(),
    tenantId: id,
    domain,
    isPrimary: true,
  });

  revalidatePath("/tenants");
  return NextResponse.json(
    { tenant: { id, slug, name, platformName } },
    { status: 201 },
  );
}
