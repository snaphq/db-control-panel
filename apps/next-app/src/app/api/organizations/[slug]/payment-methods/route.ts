import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import { getCurrentTenant } from "@repo/core/tenant";
import { and, db, eq } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/organizations/[slug]/payment-methods
 * Lists card payment methods attached to the org's Stripe customer.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  const tenant = await getCurrentTenant();

  const [org] = await db()
    .select()
    .from(organization)
    .where(
      and(eq(organization.tenantId, tenant.id), eq(organization.slug, slug)),
    )
    .limit(1);
  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [membership] = await db()
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, org.id),
        eq(member.userId, session.user.id),
        eq(member.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!org.stripeCustomerId) {
    return NextResponse.json({ cards: [] });
  }

  try {
    const [methods, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: org.stripeCustomerId,
        type: "card",
        limit: 10,
      }),
      stripe.customers.retrieve(org.stripeCustomerId),
    ]);

    const defaultId = !("deleted" in customer && customer.deleted)
      ? ((typeof customer.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id) ?? null)
      : null;

    const cards = methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? "card",
      last4: pm.card?.last4 ?? "",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
      funding: pm.card?.funding ?? "credit",
      isDefault: pm.id === defaultId,
    }));

    return NextResponse.json({ cards });
  } catch (err) {
    console.error("payment-methods fetch failed for org", org.id, err);
    return NextResponse.json(
      { error: "Failed to load payment methods" },
      { status: 500 },
    );
  }
}
