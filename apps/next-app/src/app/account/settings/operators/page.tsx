import { OperatorsManager } from "@/components/account/operators/operators-manager";
import type { OperatorView } from "@/components/account/operators/types";
import {
  listUserOrganizations,
  parseOperatorScope,
} from "@/lib/auth/operator-token";
import { requireSession } from "@/lib/auth/require-membership";
import { listOperatorsForUser } from "@/lib/operators/management";
import { getCurrentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const { user } = await requireSession("/account/settings/operators");
  const tenant = await getCurrentTenant();
  const [operators, organizations] = await Promise.all([
    listOperatorsForUser(user.id, tenant.id),
    listUserOrganizations(tenant.id, user.id),
  ]);

  const initialOperators: OperatorView[] = operators.map((operator) => ({
    id: operator.id,
    name: operator.name,
    description: operator.description,
    status: operator.status,
    scope: parseOperatorScope(operator.scope) ?? { mode: "unknown" },
    createdAt: operator.createdAt.toISOString(),
    updatedAt: operator.updatedAt.toISOString(),
    tokens: operator.tokens.map((token) => ({
      id: token.id,
      label: token.label,
      tokenPrefix: token.tokenPrefix,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
      lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
      createdAt: token.createdAt.toISOString(),
      revokedAt: null,
    })),
  }));

  return (
    <div className="flex max-w-[900px] flex-col gap-6 px-4 pt-5 pb-20">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Operators</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Named machine identities for programmatic access. Each operator is
          scoped to organizations you choose, can hold several keys, and every
          request is attributed to it.
        </p>
      </div>
      <OperatorsManager
        initialOperators={initialOperators}
        organizations={organizations}
      />
    </div>
  );
}
