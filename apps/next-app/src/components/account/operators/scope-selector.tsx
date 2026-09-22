"use client";

import { Label } from "@/components/ui/label";
import type { OperatorOrganizationOption } from "./types";

export type ScopeMode = "all_owned" | "organizations";

type Props = {
  organizations: OperatorOrganizationOption[];
  mode: ScopeMode;
  onModeChange: (mode: ScopeMode) => void;
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
};

export function ScopeSelector({
  organizations,
  mode,
  onModeChange,
  selectedIds,
  onChangeSelectedIds,
}: Props) {
  const toggle = (id: string) => {
    onChangeSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <Label
          htmlFor="operator-scope-mode"
          className="text-xs uppercase text-muted-foreground"
        >
          Scope
        </Label>
        <select
          id="operator-scope-mode"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as ScopeMode)}
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all_owned">All organizations I own</option>
          <option value="organizations">Specific organizations</option>
        </select>
      </div>

      {mode === "organizations" ? (
        organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not a member of any organizations yet.
          </p>
        ) : (
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
            {organizations.map((org) => (
              <label
                key={org.id}
                className="flex items-center gap-2 text-sm"
                htmlFor={`operator-org-${org.id}`}
              >
                <input
                  id={`operator-org-${org.id}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={selectedIds.includes(org.id)}
                  onChange={() => toggle(org.id)}
                />
                <span className="flex-1">
                  {org.name}{" "}
                  <span className="text-muted-foreground">
                    ({org.slug} · {org.role})
                  </span>
                </span>
              </label>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
