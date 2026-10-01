import { billingCleanupPendingFunction } from "./billing/functions/cleanup-pending";
import { billingReferralWindowFunction } from "./billing/functions/referral-window";
import { billingTrialExpirationFunction } from "./billing/functions/trial-expiration";

export const allFunctions = [
  billingTrialExpirationFunction,
  billingCleanupPendingFunction,
  billingReferralWindowFunction,
];
