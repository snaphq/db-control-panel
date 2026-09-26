export type OperatorOrganizationOption = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

export type OperatorTokenView = {
  id: string;
  label: string | null;
  tokenPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  // Always null in list responses; set on the operator detail page, which
  // also returns revoked keys as history.
  revokedAt: string | null;
};

export type OperatorActivityView = {
  id: string;
  credentialId: string | null;
  eventType: string;
  toolName: string | null;
  method: string | null;
  statusCode: number | null;
  durationMs: number | null;
  success: boolean | null;
  error: string | null;
  createdAt: string;
};

export type OperatorScopeView =
  | { mode: "all_owned" }
  | { mode: "organizations"; organizationIds: string[] }
  | { mode: "unknown" };

export type OperatorView = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scope: OperatorScopeView;
  createdAt: string;
  updatedAt: string;
  tokens: OperatorTokenView[];
};

// Operator detail page payload: tokens include revoked keys (revokedAt set),
// ordered active first, then revoked, newest first within each group.
export type OperatorDetailView = OperatorView;
