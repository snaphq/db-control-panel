// Re-export types
export * from "./types";

// Re-export constants
export * from "./constants";

// Re-export subscription utilities
export {
  getActiveSubscription,
  getSubscriptionWithProduct,
  isSubscriptionActive,
  getTrialEndDate,
  isInTrial,
  getOrganizationWithBilling,
  getAllSubscriptions,
} from "./subscription";

// Re-export organization billing utilities
export {
  getOrganizationPlan,
  hasActiveSubscription,
  isFreeTier,
  isOrganizationInTrial,
  getOrganizationTrialEndDate,
  isReadOnly,
  isOrganizationActive,
  getOrganizationStatus,
  canUserCreateFreeWorkspace,
  getUserOwnedFreeWorkspaceCount,
  getUserOwnedOrganizations,
  updateOrganizationStatus,
  updateOrganizationStripeCustomer,
} from "./organization";

// Re-export feature utilities
export {
  getTierFeatures,
  getOrgFeatureOverrides,
  getOrganizationFeatures,
  hasFeature,
  getFeatureLimit,
  checkFeatureLimitAccess,
  addOrgFeatureOverride,
  removeOrgFeatureOverride,
  setTierFeature,
  removeTierFeature,
  getAppSetting,
  setAppSetting,
  parseFeatureValue,
} from "./features";

// Re-export usage utilities
export {
  getCurrentMemberCount,
  getCurrentProjectCount,
  canAddMember,
  canAddProject,
  getUsageSummary,
  canDowngradeToPlan,
  canDowngradeToFree,
  getRemainingCapacity,
  calculatePercentage,
} from "./usage";

// Re-export audit utilities
export {
  logBillingEvent,
  getOrganizationAuditLogs,
  getLatestAuditLog,
} from "./audit";

// Re-export middleware utilities
export {
  checkReadOnlyAccess,
  checkOrganizationWriteAccess,
  checkFeatureAccess,
  checkFeatureLimit,
  checkBillingPermission,
  combineChecks,
} from "./middleware";
export type { BillingMiddlewareResult } from "./middleware";
export type { LogBillingEventParams } from "./audit";

// Re-export pricing-plans (M3)
export {
  listPricingPlans,
  getPricingPlan,
  getPricingPlanByKey,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  reorderPricingPlans,
  validateStripePriceId,
} from "./pricing-plans";
export type {
  PricingPlan,
  NewPricingPlan,
  UpdatePricingPlanPatch,
  ValidateStripePriceResult,
} from "./pricing-plans";

// Re-export billing cron runners (Inngest)
export {
  runTrialExpirationCheck,
  type TrialExpirationResult,
} from "./cron/trial-expiration";
export {
  runPendingOrganizationCleanup,
  type PendingCleanupResult,
} from "./cron/cleanup-pending";
