import type {
  OperatorOrganizationOption,
  OperatorScopeView,
  OperatorTokenView,
  OperatorView,
} from "./types";

/** Number of activity entries shown on the operator page. */
export const ACTIVITY_LIMIT = 50;

export const OPERATORS_PATH = "/account/settings/operators";

export function operatorPath(operatorId: string): string {
  return `${OPERATORS_PATH}/${encodeURIComponent(operatorId)}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeOrNever(value: string | null): string {
  if (!value) return "Never";
  const diffMs = Date.now() - new Date(value).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function isExpired(value: string | null): boolean {
  return value !== null && new Date(value).getTime() <= Date.now();
}

export function scopeLabel(
  scope: OperatorScopeView,
  organizations: OperatorOrganizationOption[],
): string {
  if (scope.mode === "all_owned") {
    return "All organizations I own";
  }
  if (scope.mode === "unknown") {
    return "Unknown scope";
  }
  const names = scope.organizationIds.map((id) => {
    const org = organizations.find((candidate) => candidate.id === id);
    return org ? org.slug : id;
  });
  return names.length > 0 ? names.join(", ") : "No organizations";
}

/** Display name for a key: its label, or a generic name with its prefix. */
export function tokenDisplayName(token: OperatorTokenView): string {
  return token.label ?? "Key";
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Not found. It may have been revoked.",
  operator_not_found: "Operator not found. It may have been revoked.",
  operator_not_active: "Resume the operator before adding keys.",
  token_not_found: "Key not found.",
  token_revoked: "This key has already been revoked.",
  label_too_long: "Label is too long (60 characters max).",
  invalid_label: "Label is invalid.",
  invalid_expiration: "Pick a valid expiration.",
};

export async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (typeof data.error !== "string") return "Request failed";
  return ERROR_MESSAGES[data.error] ?? data.error;
}

type RawToken = Omit<OperatorTokenView, "revokedAt"> & {
  revokedAt?: string | null;
};

type RawOperator = Omit<OperatorView, "scope" | "tokens"> & {
  scope: OperatorScopeView | null;
  tokens: RawToken[];
};

/**
 * Normalize an operator from the JSON API. The list endpoint returns the raw
 * scope (possibly null) and omits `revokedAt`, so fill in the view defaults.
 */
export function normalizeOperator(raw: RawOperator): OperatorView {
  return {
    ...raw,
    scope: raw.scope ?? { mode: "unknown" },
    tokens: raw.tokens.map((token) => ({
      ...token,
      revokedAt: token.revokedAt ?? null,
    })),
  };
}
