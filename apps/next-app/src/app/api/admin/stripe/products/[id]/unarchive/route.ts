import { auth } from "@repo/auth/server";
import { stripe } from "@repo/billing/stripe/client";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getErrorMessage } from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
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

    const product = await stripe.products.update(id, {
      active: true,
    });

    revalidatePath("/adminx/stripe/products");
    revalidatePath(`/adminx/stripe/products/${id}`);

    return NextResponse.json({ status: "unarchived", product });
  } catch (error: unknown) {
    console.error("Error unarchiving product:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
