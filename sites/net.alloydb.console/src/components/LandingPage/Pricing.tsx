import { getPricingTiers } from "@repo/billing/stripe/queries";
import { PricingDisplay } from "./PricingDisplay";

export default async function Pricing() {
  const tiers = await getPricingTiers();

  return <PricingDisplay tiers={tiers} />;
}
