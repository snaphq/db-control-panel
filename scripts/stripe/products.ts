import { confirm, input } from "@inquirer/prompts";
import type Stripe from "stripe";
import { colors } from "../lib/colors";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
} from "../lib/log";
import { ENTERPRISE_FEATURES, TIER_FEATURES } from "./constants";
import type { CreatedProduct } from "./types";

async function getPriceInput(
  tierName: string,
  periodLabel: string,
  defaultValue: string,
): Promise<string> {
  return input({
    message: `${tierName} ${periodLabel} price (USD):`,
    default: defaultValue,
    validate: (value) => {
      const num = Number.parseFloat(value);
      if (Number.isNaN(num) || num < 0) return "Please enter a valid price";
      return true;
    },
  });
}

async function createTier(
  stripe: Stripe,
  tierNumber: number,
  monthlyDefault: string,
  yearlyDefault: string,
): Promise<CreatedProduct | null> {
  const tierName = `Tier ${tierNumber}`;
  console.log("");
  console.log(`  ${colors.bold}${tierName}:${colors.reset}`);

  const monthlyPrice = await getPriceInput(tierName, "monthly", monthlyDefault);
  const yearlyPrice = await getPriceInput(tierName, "yearly", yearlyDefault);

  const isPopular = tierNumber === 2;
  const features = TIER_FEATURES[tierNumber] || [];

  try {
    const product = await stripe.products.create({
      name: tierName,
      description: `${tierName} - Update name and description in admin portal`,
      metadata: {
        plan_tier: `tier_${tierNumber}`,
        created_by: "setup-stripe",
        display_order: String(tierNumber),
        features: JSON.stringify(features),
        popular: isPopular ? "true" : "false",
        action_label: "Get Started",
      },
    });

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number.parseFloat(monthlyPrice) * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { billing_period: "monthly" },
    });

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number.parseFloat(yearlyPrice) * 100),
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { billing_period: "yearly" },
    });

    await stripe.products.update(product.id, {
      default_price: monthly.id,
    });

    printSuccess(`Created ${tierName}: ${product.id}`);
    console.log(
      `    ${colors.dim}Monthly: $${monthlyPrice}/mo (${monthly.id})${colors.reset}`,
    );
    console.log(
      `    ${colors.dim}Yearly: $${yearlyPrice}/yr (${yearly.id})${colors.reset}`,
    );

    return {
      name: tierName,
      id: product.id,
      priceIds: [monthly.id, yearly.id],
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Failed to create ${tierName}: ${errorMessage}`);
    return null;
  }
}

async function createEnterpriseTier(
  stripe: Stripe,
): Promise<CreatedProduct | null> {
  console.log("");
  console.log(`  ${colors.bold}Enterprise:${colors.reset}`);

  try {
    const enterpriseProduct = await stripe.products.create({
      name: "Enterprise",
      description:
        "Enterprise tier - Contact us for custom pricing tailored to your needs",
      metadata: {
        plan_tier: "enterprise",
        pricing_type: "contact",
        created_by: "setup-stripe",
        display_order: "10",
        features: JSON.stringify(ENTERPRISE_FEATURES),
        popular: "false",
        exclusive: "true",
        action_label: "Contact Sales",
      },
    });

    printSuccess(`Created Enterprise tier: ${enterpriseProduct.id}`);
    console.log(
      `    ${colors.dim}No default price - create custom prices per customer in adminx${colors.reset}`,
    );

    return {
      name: "Enterprise",
      id: enterpriseProduct.id,
      priceIds: [],
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(`Failed to create Enterprise tier: ${errorMessage}`);
    return null;
  }
}

export async function createDefaultProducts(
  stripe: Stripe,
): Promise<CreatedProduct[]> {
  printHeader("STEP 4: CREATE PRICING TIERS");

  console.log(
    `  ${colors.dim}Note: Free tier is managed locally and not created in Stripe.${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}Products are created with generic names (Tier 1, Tier 2, etc.).${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}You can rename them later in the admin portal: /adminx/stripe/products${colors.reset}`,
  );
  console.log("");

  const shouldCreateProducts = await confirm({
    message: "Create pricing tiers?",
    default: true,
  });

  if (!shouldCreateProducts) {
    printWarning("Product creation skipped");
    printInfo(
      `You can create products later in the admin portal: ${colors.cyan}/adminx/stripe/products${colors.reset}`,
    );
    return [];
  }

  const createdProducts: CreatedProduct[] = [];

  console.log("");
  printInfo("Creating pricing tiers in Stripe...");

  const tier1 = await createTier(stripe, 1, "19", "190");
  if (tier1) createdProducts.push(tier1);

  const tier2 = await createTier(stripe, 2, "49", "490");
  if (tier2) createdProducts.push(tier2);

  console.log("");
  const createTier3 = await confirm({
    message: "Create Tier 3?",
    default: false,
  });

  if (createTier3) {
    const tier3 = await createTier(stripe, 3, "99", "990");
    if (tier3) createdProducts.push(tier3);
  }

  console.log("");
  console.log(
    `  ${colors.dim}Enterprise tier: For custom pricing via email/sales contact.${colors.reset}`,
  );
  console.log(
    `  ${colors.dim}No price is attached - you create custom prices per customer in adminx.${colors.reset}`,
  );

  const createEnterprise = await confirm({
    message: "Create Enterprise tier (contact-based, no default price)?",
    default: true,
  });

  if (createEnterprise) {
    const enterprise = await createEnterpriseTier(stripe);
    if (enterprise) createdProducts.push(enterprise);
  }

  return createdProducts;
}
