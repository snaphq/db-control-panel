/**
 * PostHog Analytics Event Definitions
 *
 * Centralized event names and property types for consistent tracking
 * across the application.
 */

// ============================================================================
// Event Names
// ============================================================================

export const ANALYTICS_EVENTS = {
  // User lifecycle events
  USER_CREATED: "user.created",
  USER_VERIFIED: "user.verified",
  USER_LOGGED_IN: "user.logged_in",
  USER_LOGGED_OUT: "user.logged_out",
  USER_PROFILE_UPDATED: "user.profile_updated",

  // Product engagement events
  USER_CHECKED_PRICING: "user.checked_pricing",
  USER_TRIAL_STARTED: "user.trial_started",
  USER_TRIAL_ENDING: "user.trial_ending",
  USER_SUBSCRIPTION_CREATED: "user.subscription_created",
  USER_SUBSCRIPTION_UPDATED: "user.subscription_updated",
  USER_SUBSCRIPTION_CANCELLED: "user.subscription_cancelled",

  // Feature usage events
  DASHBOARD_VIEWED: "dashboard.viewed",
  FEATURE_USED: "feature.used",
  SETTINGS_UPDATED: "settings.updated",

  // Organization events
  ORGANIZATION_CREATED: "organization.created",
  ORGANIZATION_MEMBER_INVITED: "organization.member_invited",
  ORGANIZATION_MEMBER_JOINED: "organization.member_joined",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// ============================================================================
// Event Property Types
// ============================================================================

export interface UserCreatedProperties {
  email: string;
  name: string;
  provider: "email" | "google" | "github" | "microsoft" | "apple";
  organization_id?: string;
}

export interface UserVerifiedProperties {
  email: string;
  verification_method: "email" | "phone";
}

export interface UserLoggedInProperties {
  email: string;
  provider: "email" | "google" | "github" | "microsoft" | "apple";
  is_new_device?: boolean;
}

export interface UserProfileUpdatedProperties {
  fields_updated: string[];
}

export interface UserCheckedPricingProperties {
  source_page: string;
  current_plan?: string;
  viewed_plans?: string[];
}

export interface UserTrialStartedProperties {
  email: string;
  name: string;
  plan_id: string;
  plan_name: string;
  trial_duration_days: number;
  trial_end_date: string;
}

export interface UserTrialEndingProperties {
  email: string;
  name: string;
  plan_id: string;
  days_remaining: number;
  trial_end_date: string;
}

export interface UserSubscriptionCreatedProperties {
  email: string;
  name: string;
  plan_id: string;
  plan_name: string;
  billing_period: "monthly" | "yearly";
  amount: number;
  currency: string;
}

export interface UserSubscriptionCancelledProperties {
  email: string;
  plan_id: string;
  plan_name: string;
  cancellation_reason?: string;
  feedback?: string;
}

export interface FeatureUsedProperties {
  feature_name: string;
  feature_category?: string;
  metadata?: Record<string, unknown>;
}

export interface OrganizationCreatedProperties {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  creator_id: string;
}

export interface OrganizationMemberInvitedProperties {
  organization_id: string;
  invitee_email: string;
  inviter_id: string;
  role: string;
}

// ============================================================================
// User Properties (for identification)
// ============================================================================

export interface UserProperties {
  email: string;
  name: string;
  plan_type?: "free" | "trial" | "tier_1" | "tier_2" | "tier_3" | "enterprise";
  organization_id?: string;
  organization_role?: "owner" | "admin" | "member";
  signup_source?: string;
  signup_date?: string;
  trial_end_date?: string;
  subscription_status?: "active" | "cancelled" | "past_due" | "trialing";
}

// ============================================================================
// Event Map Type (for type-safe tracking)
// ============================================================================

export interface AnalyticsEventMap {
  [ANALYTICS_EVENTS.USER_CREATED]: UserCreatedProperties;
  [ANALYTICS_EVENTS.USER_VERIFIED]: UserVerifiedProperties;
  [ANALYTICS_EVENTS.USER_LOGGED_IN]: UserLoggedInProperties;
  [ANALYTICS_EVENTS.USER_LOGGED_OUT]: Record<string, never>;
  [ANALYTICS_EVENTS.USER_PROFILE_UPDATED]: UserProfileUpdatedProperties;
  [ANALYTICS_EVENTS.USER_CHECKED_PRICING]: UserCheckedPricingProperties;
  [ANALYTICS_EVENTS.USER_TRIAL_STARTED]: UserTrialStartedProperties;
  [ANALYTICS_EVENTS.USER_TRIAL_ENDING]: UserTrialEndingProperties;
  [ANALYTICS_EVENTS.USER_SUBSCRIPTION_CREATED]: UserSubscriptionCreatedProperties;
  [ANALYTICS_EVENTS.USER_SUBSCRIPTION_UPDATED]: UserSubscriptionCreatedProperties;
  [ANALYTICS_EVENTS.USER_SUBSCRIPTION_CANCELLED]: UserSubscriptionCancelledProperties;
  [ANALYTICS_EVENTS.DASHBOARD_VIEWED]: Record<string, never>;
  [ANALYTICS_EVENTS.FEATURE_USED]: FeatureUsedProperties;
  [ANALYTICS_EVENTS.SETTINGS_UPDATED]: { settings_changed: string[] };
  [ANALYTICS_EVENTS.ORGANIZATION_CREATED]: OrganizationCreatedProperties;
  [ANALYTICS_EVENTS.ORGANIZATION_MEMBER_INVITED]: OrganizationMemberInvitedProperties;
  [ANALYTICS_EVENTS.ORGANIZATION_MEMBER_JOINED]: {
    organization_id: string;
    member_id: string;
    role: string;
  };
}
