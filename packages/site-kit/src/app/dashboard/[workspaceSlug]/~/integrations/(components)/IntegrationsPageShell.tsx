import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

type IntegrationsTab = "console" | "marketplace";

interface IntegrationsPageShellProps {
  workspaceSlug: string;
  activeTab: IntegrationsTab;
  children: ReactNode;
}

export function IntegrationsPageShell({
  workspaceSlug,
  activeTab,
  children,
}: IntegrationsPageShellProps) {
  const base = `/dashboard/${encodeURIComponent(workspaceSlug)}/~/integrations`;
  const tabs: { id: IntegrationsTab; label: string; href: string }[] = [
    { id: "console", label: "Integrations Console", href: base },
    {
      id: "marketplace",
      label: "Browse Marketplace",
      href: `${base}/marketplace`,
    },
  ];

  return (
    <div className="flex flex-col gap-8 px-4 pb-20 pt-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-normal tracking-tight">Integrations</h1>
        <nav
          aria-label="Integrations sections"
          className="inline-flex items-center gap-2"
        >
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-accent",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
