import { auth } from "@repo/auth/server";
import { BILLING_MANAGEMENT_ROLES } from "@repo/billing";
import { stripe } from "@repo/billing/stripe/client";
import { getCurrentTenant } from "@repo/core/tenant";
import { and, db, eq, ne } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

const TAX_ID_TYPES = [
  "us_ein",
  "eu_vat",
  "gb_vat",
  "ca_gst_hst",
  "au_abn",
  "in_gst",
] as const;

const STRIPE_TAX_ID_TYPE_MAP: Record<
  (typeof TAX_ID_TYPES)[number],
  // Stripe's TaxIDData.Type values for the subset we support
  "us_ein" | "eu_vat" | "gb_vat" | "ca_gst_hst" | "au_abn" | "in_gst"
> = {
  us_ein: "us_ein",
  eu_vat: "eu_vat",
  gb_vat: "gb_vat",
  ca_gst_hst: "ca_gst_hst",
  au_abn: "au_abn",
  in_gst: "in_gst",
};

const INVOICE_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ja"] as const;

const billingDetailsSchema = z
  .object({
    invoiceEmail: z
      .string()
      .trim()
      .max(254)
      .email()
      .nullish()
      .or(z.literal("")),
    companyName: z.string().trim().max(64).nullish().or(z.literal("")),
    billingCountry: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .nullish()
      .or(z.literal("")),
    billingAddress: z.string().trim().max(1000).nullish().or(z.literal("")),
    invoiceLanguage: z.enum(INVOICE_LANGUAGES).optional(),
    invoicePurchaseOrder: z.string().trim().max(64).nullish().or(z.literal("")),
    taxIdType: z.enum(TAX_ID_TYPES).nullish().or(z.literal("")),
    taxIdValue: z.string().trim().max(64).nullish().or(z.literal("")),
  })
  .partial();

function normalizeOptional(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * GET /api/organizations/[slug]
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

  return NextResponse.json(org);
}

/**
 * PUT /api/organizations/[slug]
 * Update workspace name and/or slug. Only owners and admins.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug: currentSlug } = await params;
  const tenant = await getCurrentTenant();

  const [org] = await db()
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.tenantId, tenant.id),
        eq(organization.slug, currentSlug),
      ),
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
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace owners and admins can edit settings." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { name, slug, billingDetails } = body as {
    name?: unknown;
    slug?: unknown;
    billingDetails?: unknown;
  };

  const update: Partial<typeof org> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters." },
        { status: 400 },
      );
    }
    update.name = name.trim();
  }

  if (slug !== undefined) {
    if (typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        {
          error:
            "Slug must be 1–50 characters: lowercase letters, numbers, dashes.",
        },
        { status: 400 },
      );
    }
    if (slug !== org.slug) {
      const [conflict] = await db()
        .select({ id: organization.id })
        .from(organization)
        .where(
          and(
            eq(organization.tenantId, tenant.id),
            eq(organization.slug, slug),
            ne(organization.id, org.id),
          ),
        )
        .limit(1);
      if (conflict) {
        return NextResponse.json(
          { error: "A workspace with this slug already exists." },
          { status: 409 },
        );
      }
      update.slug = slug;
    }
  }

  if (billingDetails !== undefined) {
    if (
      !BILLING_MANAGEMENT_ROLES.includes(
        membership.role as (typeof BILLING_MANAGEMENT_ROLES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Only owners and billing admins can edit billing details." },
        { status: 403 },
      );
    }
    const parsed = billingDetailsSchema.safeParse(billingDetails);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid billing details" },
        { status: 400 },
      );
    }
    const b = parsed.data;
    if ("invoiceEmail" in b)
      update.invoiceEmail = normalizeOptional(b.invoiceEmail);
    if ("companyName" in b)
      update.companyName = normalizeOptional(b.companyName);
    if ("billingCountry" in b) {
      const v = normalizeOptional(b.billingCountry);
      update.billingCountry = v ? v.toUpperCase() : v;
    }
    if ("billingAddress" in b)
      update.billingAddress = normalizeOptional(b.billingAddress);
    if (b.invoiceLanguage !== undefined)
      update.invoiceLanguage = b.invoiceLanguage;
    if ("invoicePurchaseOrder" in b)
      update.invoicePurchaseOrder = normalizeOptional(b.invoicePurchaseOrder);
    if ("taxIdType" in b) {
      const v = normalizeOptional(b.taxIdType);
      update.taxIdType = v as typeof update.taxIdType;
    }
    if ("taxIdValue" in b) update.taxIdValue = normalizeOptional(b.taxIdValue);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const [updated] = await db()
    .update(organization)
    .set(update)
    .where(
      and(eq(organization.id, org.id), eq(organization.tenantId, tenant.id)),
    )
    .returning();

  // Best-effort Stripe customer sync for billing detail changes.
  if (billingDetails !== undefined && updated.stripeCustomerId) {
    const customerUpdate: Record<string, unknown> = {};
    if ("companyName" in update)
      customerUpdate.name = updated.companyName ?? updated.name;
    if ("invoiceEmail" in update && updated.invoiceEmail)
      customerUpdate.email = updated.invoiceEmail;
    if ("billingAddress" in update || "billingCountry" in update) {
      customerUpdate.address = updated.billingCountry
        ? {
            country: updated.billingCountry,
            line1: updated.billingAddress ?? undefined,
          }
        : null;
    }

    try {
      if (Object.keys(customerUpdate).length > 0) {
        await stripe.customers.update(
          updated.stripeCustomerId,
          customerUpdate as never,
        );
      }

      if ("taxIdType" in update || "taxIdValue" in update) {
        const stripeCustomerId = updated.stripeCustomerId;
        const existing = await stripe.customers.listTaxIds(stripeCustomerId, {
          limit: 10,
        });
        await Promise.all(
          existing.data.map((t) =>
            stripe.customers.deleteTaxId(stripeCustomerId, t.id),
          ),
        );
        if (updated.taxIdType && updated.taxIdValue) {
          await stripe.customers.createTaxId(stripeCustomerId, {
            type: STRIPE_TAX_ID_TYPE_MAP[
              updated.taxIdType as (typeof TAX_ID_TYPES)[number]
            ],
            value: updated.taxIdValue,
          });
        }
      }
    } catch (err) {
      console.error("stripe sync failed for org", updated.id, err);
      return NextResponse.json(
        {
          ...updated,
          stripeSyncWarning:
            "Saved, but syncing to Stripe failed. Please try again.",
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json(updated);
}
