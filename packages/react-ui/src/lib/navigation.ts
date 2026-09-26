import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  ClipboardList,
  CreditCard,
  Folder,
  Gift,
  HomeIcon,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";

export type NavItem = {
  label: string;
  icon: LucideIcon;
  segment: string;
};

export type NavSection = {
  title: string;
  id?: string;
  icon?: LucideIcon;
  items: NavItem[];
  children?: NavItem[];
};

export type NavConfig = {
  main: NavSection[];
  bottom: NavItem[];
};

/**
 * Workspace-level navigation (no project selected).
 */
export const workspaceNav: NavConfig = {
  main: [
    {
      title: "",
      items: [
        { label: "Home", icon: HomeIcon, segment: "" },
        { label: "Integrations", icon: Plug, segment: "~/integrations" },
        { label: "Referrals", icon: Gift, segment: "~/referrals" },
      ],
    },
    {
      id: "agents",
      title: "Agents",
      icon: Bot,
      items: [],
      children: [
        { label: "Tasks", icon: ClipboardList, segment: "~/agents/tasks" },
        { label: "Usage", icon: BarChart3, segment: "~/agents/usage" },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      items: [],
      children: [
        { label: "General", icon: SlidersHorizontal, segment: "~/settings" },
        { label: "Members", icon: Users, segment: "~/settings/members" },
        { label: "Billing", icon: CreditCard, segment: "~/settings/billing" },
        {
          label: "AI Provider",
          icon: Sparkles,
          segment: "~/settings/ai-provider",
        },
      ],
    },
  ],
  bottom: [],
};

/**
 * Project-level navigation (workspace + project selected).
 */
export const projectNav: NavConfig = {
  main: [
    {
      title: "",
      items: [
        { label: "Home", icon: HomeIcon, segment: "" },
        { label: "Finance", icon: Folder, segment: "finance" },
        { label: "Integrations", icon: Plug, segment: "integrations" },
      ],
    },
    {
      id: "agents",
      title: "Agents",
      icon: Bot,
      items: [],
      children: [
        { label: "Installed", icon: Bot, segment: "agents" },
        { label: "Tasks", icon: ClipboardList, segment: "~/agents/tasks" },
        { label: "Usage", icon: BarChart3, segment: "~/agents/usage" },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      items: [],
      children: [
        { label: "General", icon: SlidersHorizontal, segment: "settings" },
        { label: "Members", icon: Users, segment: "~/settings/members" },
        { label: "Billing", icon: CreditCard, segment: "~/settings/billing" },
      ],
    },
  ],
  bottom: [],
};

/**
 * Build an absolute href for a NavItem segment.
 *
 * Conventions:
 * - Segments starting with "~/" are workspace-scoped.
 * - Other segments are project-scoped if a project is active, otherwise
 *   they fall back to the workspace root.
 */
export function buildHref(
  workspaceSlug: string,
  projectSlug: string | undefined,
  segment: string,
): string {
  if (segment.startsWith("~/")) {
    return `/dashboard/${workspaceSlug}/${segment}`;
  }
  if (projectSlug) {
    const base = `/dashboard/${workspaceSlug}/${projectSlug}`;
    return segment ? `${base}/${segment}` : base;
  }
  return segment
    ? `/dashboard/${workspaceSlug}/${segment}`
    : `/dashboard/${workspaceSlug}`;
}

/**
 * A flattened, searchable representation of a navigation destination.
 * Each top-level item and each drill-down child becomes one FinderRow.
 */
export type FinderRow = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Breadcrumb context shown muted on the right (e.g. ["Settings"]). */
  breadcrumb: string[];
};

/**
 * Flatten a NavConfig into a list of searchable rows for the sidebar finder.
 *
 * - Top-level items appear with an empty breadcrumb (or [workspaceLabel]).
 * - Drill-down children appear with the parent section's title in their breadcrumb.
 * - Bottom items are included as well, with no breadcrumb.
 */
export function flattenNav(
  config: NavConfig,
  workspaceSlug: string,
  projectSlug: string | undefined,
  workspaceLabel?: string,
): FinderRow[] {
  const rows: FinderRow[] = [];
  const baseCrumb = workspaceLabel ? [workspaceLabel] : [];

  for (const section of config.main) {
    for (const item of section.items) {
      rows.push({
        label: item.label,
        href: buildHref(workspaceSlug, projectSlug, item.segment),
        icon: item.icon,
        breadcrumb: baseCrumb,
      });
    }
    if (section.children) {
      for (const child of section.children) {
        rows.push({
          label: child.label,
          href: buildHref(workspaceSlug, projectSlug, child.segment),
          icon: child.icon,
          breadcrumb: section.title ? [...baseCrumb, section.title] : baseCrumb,
        });
      }
    }
  }

  for (const item of config.bottom) {
    rows.push({
      label: item.label,
      href: buildHref(workspaceSlug, projectSlug, item.segment),
      icon: item.icon,
      breadcrumb: baseCrumb,
    });
  }

  return rows;
}
