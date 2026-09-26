import { getAdminSession } from "@/lib/admin-auth";
import { stripe } from "@repo/billing/stripe/client";
import type { Stripe } from "@repo/billing/stripe/client";
import {
  createErrorWithCode,
  getErrorCode,
  getErrorMessage,
} from "@repo/core/error-utils";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

async function listAllPrices(productId: string) {
  const prices: Stripe.Price[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const response = await stripe.prices.list({
      product: productId,
      limit: 100,
      starting_after: startingAfter,
    });

    prices.push(...response.data);

    if (!response.has_more) {
      break;
    }

    startingAfter = response.data[response.data.length - 1]?.id;
    if (!startingAfter) {
      break;
    }
  }

  return prices;
}

async function deletePrice(priceId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured");
  }

  const response = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    if (response.status === 404) {
      return payload;
    }

    const error = payload?.error ?? {};
    throw createErrorWithCode(
      typeof error.message === "string"
        ? error.message
        : "Failed to delete price",
      typeof error.code === "string" ? error.code : undefined,
    );
  }

  return payload;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAdminSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    try {
      const prices = await listAllPrices(id);
      let hasUsedPrices = false;

      for (const price of prices) {
        try {
          await deletePrice(price.id);
        } catch (error: unknown) {
          if (
            getErrorCode(error) === "price_in_use" ||
            getErrorMessage(error, "").includes("Price has been used")
          ) {
            hasUsedPrices = true;
            continue;
          }

          throw error;
        }
      }

      if (hasUsedPrices) {
        return NextResponse.json(
          {
            status: "in_use",
            reason:
              "Product has prices with active subscriptions and cannot be deleted.",
          },
          { status: 200 },
        );
      }

      await stripe.products.del(id);

      revalidatePath("/stripe/products");
      revalidatePath(`/stripe/products/${id}`);

      return NextResponse.json({ status: "deleted" });
    } catch (error: unknown) {
      if (getErrorCode(error) === "product_in_use") {
        return NextResponse.json(
          {
            status: "in_use",
            reason:
              getErrorMessage(error) ||
              "Product cannot be deleted because it has been used in subscriptions or invoices.",
          },
          { status: 200 },
        );
      }

      throw error;
    }
  } catch (error: unknown) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
