import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const marketingFeaturesSchema = z.array(z.string().min(1).max(80)).max(8);

const updateProductSchema = z.object({
  name: z.string().min(1).max(250).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  images: z.array(z.string().url()).max(1).optional(),
  metadata: z.record(z.string()).optional(),
  statementDescriptor: z.string().min(5).max(22).nullable().optional(),
  unitLabel: z.string().min(1).max(12).nullable().optional(),
  marketingFeatures: marketingFeaturesSchema.optional(),
  defaultPriceId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const product = await stripe.products.retrieve(id);

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const body = await req.json();
    const validatedData = updateProductSchema.parse(body);

    const product = await stripe.products.update(id, {
      name: validatedData.name,
      description:
        validatedData.description === undefined
          ? undefined
          : validatedData.description,
      active: validatedData.active,
      images: validatedData.images,
      statement_descriptor:
        validatedData.statementDescriptor === undefined
          ? undefined
          : (validatedData.statementDescriptor as string),
      unit_label:
        validatedData.unitLabel === undefined
          ? undefined
          : validatedData.unitLabel,
      features:
        validatedData.marketingFeatures !== undefined
          ? validatedData.marketingFeatures.map((name) => ({ name }))
          : undefined,
      default_price: validatedData.defaultPriceId,
      metadata: {
        updated_by: session.user.email || session.user.id,
        updated_at: new Date().toISOString(),
        ...validatedData.metadata,
      },
    });

    revalidatePath("/adminx/stripe/products");
    revalidatePath(`/adminx/stripe/products/${id}`);

    return NextResponse.json(product);
  } catch (error: unknown) {
    console.error("Error updating product:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;

    await stripe.products.update(id, { active: false });

    revalidatePath("/adminx/stripe/products");
    revalidatePath(`/adminx/stripe/products/${id}`);

    return NextResponse.json({ success: true, message: "Product archived" });
  } catch (error: unknown) {
    console.error("Error archiving product:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
