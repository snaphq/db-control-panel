"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "../../lib/utils";

export function SidebarNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50",
        active &&
          "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function SidebarDrillDownButton({
  title,
  icon: Icon,
  onClick,
}: {
  title?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left">{title}</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

export function SidebarGroupLabel({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {title}
    </div>
  );
}

export function resolveMostSpecificActiveHref(
  pathname: string,
  hrefs: string[],
): string | null {
  const matches = hrefs.filter(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );
  if (!matches.length) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}
