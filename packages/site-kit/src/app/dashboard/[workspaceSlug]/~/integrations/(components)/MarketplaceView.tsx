"use client";

import type { Integration } from "@repo/database/schema";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@repo/ui/lib/utils";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { IntegrationTile } from "./IntegrationTile";

interface MarketplaceViewProps {
  workspaceSlug: string;
  integrations: Integration[];
}

const ALL = "__all__";

export function MarketplaceView({
  workspaceSlug,
  integrations,
}: MarketplaceViewProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const deferredQuery = useDeferredValue(query);
  const baseHref = `/dashboard/${encodeURIComponent(workspaceSlug)}/~/integrations`;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of integrations) set.add(i.category);
    return Array.from(set).sort();
  }, [integrations]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return integrations.filter((i) => {
      if (category !== ALL && i.category !== category) return false;
      if (!needle) return true;
      return (
        i.name.toLowerCase().includes(needle) ||
        i.slug.toLowerCase().includes(needle) ||
        (i.description?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [integrations, deferredQuery, category]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            className="pl-9"
            aria-label="Search integrations"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label="All"
          active={category === ALL}
          onClick={() => setCategory(ALL)}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No integrations match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <IntegrationTile key={i.id} integration={i} baseHref={baseHref} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn("h-7 rounded-full px-3 text-xs capitalize")}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
