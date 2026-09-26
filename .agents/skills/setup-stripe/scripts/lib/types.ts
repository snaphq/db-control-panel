import type Stripe from "stripe";

export interface CreatedProduct {
  name: string;
  id: string;
  priceIds: string[];
}

export interface SetupResult {
  keysVerified: boolean;
  webhookConfigured: boolean;
  webhookSecret?: string;
  migrationRan: boolean;
  productsCreated: CreatedProduct[];
  dataBackfilled: boolean;
}

export interface VerifyApiKeysResult {
  valid: boolean;
  isLiveMode: boolean;
  stripe: Stripe | null;
}

export interface WebhookSetupResult {
  configured: boolean;
  secret?: string;
}
