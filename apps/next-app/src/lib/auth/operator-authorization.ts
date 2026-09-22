import "server-only";

import { getCurrentMcpContext } from "@repo/mcp-chatgpt";
import type { OperatorOrganization } from "./operator-token";
import { OPERATOR_WRITE_ROLES } from "./operator-token";

export class OperatorAuthorizationError extends Error {
  readonly status: 400 | 403 | 404;

  constructor(status: 400 | 403 | 404, message: string) {
    super(message);
    this.name = "OperatorAuthorizationError";
    this.status = status;
  }
}

export type OperatorRequestContext = {
  operatorId: string;
  operatorName: string;
  userId: string;
  credentialId?: string;
  organizations: OperatorOrganization[];
};

/**
 * Read the operator identity for the current request from the MCP request
 * context. Returns null when the request did not authenticate with an operator
 * credential (session, agent JWT, OAuth, or development bypass).
 */
export function getOperatorRequestContext(): OperatorRequestContext | null {
  const ctx = getCurrentMcpContext();
  if (!ctx || ctx.actorType !== "operator" || !ctx.operator) return null;
  if (!ctx.userId) return null;
  return {
    operatorId: ctx.operator.id,
    operatorName: ctx.operator.name,
    userId: ctx.userId,
    credentialId: ctx.credentialId,
    organizations: ctx.operator.organizations,
  };
}

/**
 * Resolve the organization an operator request acts on.
 *
 * Reachability was resolved live during token verification in this request, so
 * this helper performs no additional queries and cannot see stale membership.
 * - `organization` accepts a slug or id; unknown values return 404.
 * - Omitted with exactly one reachable organization: auto-selected.
 * - Omitted with multiple: 400 listing the accessible slugs.
 * - `write: true` requires the live role `owner` or `admin`.
 */
export function requireOperatorOrganization(options?: {
  organization?: string;
  write?: boolean;
}): {
  operatorId: string;
  operatorName: string;
  userId: string;
  organization: OperatorOrganization;
  write: boolean;
} {
  const ctx = getOperatorRequestContext();
  if (!ctx) {
    throw new OperatorAuthorizationError(
      403,
      "Operator credentials are required for this operation",
    );
  }

  const organizations = ctx.organizations;
  if (organizations.length === 0) {
    throw new OperatorAuthorizationError(
      403,
      `Operator "${ctx.operatorName}" has no reachable organizations`,
    );
  }

  const requested = options?.organization?.trim();
  let organization: OperatorOrganization | undefined;
  if (requested) {
    organization = organizations.find(
      (candidate) => candidate.slug === requested || candidate.id === requested,
    );
    if (!organization) {
      throw new OperatorAuthorizationError(
        404,
        "Organization not found for this operator",
      );
    }
  } else if (organizations.length === 1) {
    organization = organizations[0];
  } else {
    throw new OperatorAuthorizationError(
      400,
      `organization is required; accessible: ${organizations
        .map((candidate) => candidate.slug)
        .join(", ")}`,
    );
  }

  const write = options?.write === true;
  if (
    write &&
    !(OPERATOR_WRITE_ROLES as readonly string[]).includes(organization.role)
  ) {
    throw new OperatorAuthorizationError(
      403,
      `Operator "${ctx.operatorName}" cannot write to "${organization.slug}" (role: ${organization.role})`,
    );
  }

  return {
    operatorId: ctx.operatorId,
    operatorName: ctx.operatorName,
    userId: ctx.userId,
    organization,
    write,
  };
}
