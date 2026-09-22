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
