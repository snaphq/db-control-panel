"use client";

import { useSidebar } from "@repo/react-ui/components/dashboard/sidebar-context";
import { SidebarFinder } from "@repo/react-ui/components/dashboard/sidebar-finder";
import { SidebarUserMenu } from "@repo/react-ui/components/dashboard/sidebar-user-menu";
import { WorkspaceSwitcher } from "@repo/react-ui/components/dashboard/workspace-switcher";
import { Separator } from "@repo/react-ui/components/ui/separator";
import {
  SidebarDrillDownButton,
  SidebarGroupLabel,
  SidebarNavLink,
  resolveMostSpecificActiveHref,
} from "@repo/react-ui/components/ui/sidebar-nav";
import {
  type NavConfig,
  type NavItem,
  type NavSection,
  buildHref,
  projectNav,
  workspaceNav,
} from "@repo/react-ui/lib/navigation";
import { cn } from "@repo/react-ui/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

function isItemActive(pathname: string, href: string, segment: string) {
  if (!segment) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavItem({
  item,
  href,
  active,
}: {
  item: NavItem;
  href: string;
  active: boolean;
}) {
  return (
    <SidebarNavLink
      href={href}
      label={item.label}
      icon={item.icon}
      active={active}
    />
  );
}

function SidebarSection({
  section,
  workspaceSlug,
  projectSlug,
  pathname,
  onDrillDown,
}: {
  section: NavSection;
  workspaceSlug: string;
  projectSlug: string | undefined;
  pathname: string;
  onDrillDown: (id: string) => void;
}) {
  if (section.id && section.children && section.children.length > 0) {
    return (
      <div className="mb-1">
        <SidebarDrillDownButton
          title={section.title}
          icon={section.icon}
          onClick={() => section.id && onDrillDown(section.id)}
        />
      </div>
    );
  }

  return (
    <div className="mb-1">
      {section.title && <SidebarGroupLabel title={section.title} />}
      {section.items.map((item) => {
        const href = buildHref(workspaceSlug, projectSlug, item.segment);
        return (
          <SidebarNavItem
            key={item.segment || item.label}
            item={item}
            href={href}
            active={isItemActive(pathname, href, item.segment)}
          />
        );
      })}
    </div>
  );
}

export default function DashboardSideBar() {
  const pathname = usePathname();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectSlug = params.projectSlug as string | undefined;
  const { activeMenuId, setActiveMenuId } = useSidebar();

  const config: NavConfig = projectSlug ? projectNav : workspaceNav;

  const activeDrillSection = useMemo(
    () => config.main.find((s) => s.id && s.id === activeMenuId) ?? null,
    [config.main, activeMenuId],
  );

  const userDismissedRef = useRef(false);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      userDismissedRef.current = false;
      prevPathnameRef.current = pathname;
    }
    if (activeMenuId) return;
    if (userDismissedRef.current) return;
    for (const section of config.main) {
      if (!section.id || !section.children) continue;
      for (const child of section.children) {
        const href = buildHref(workspaceSlug, projectSlug, child.segment);
        if (pathname === href || pathname.startsWith(`${href}/`)) {
          setActiveMenuId(section.id);
          return;
        }
      }
    }
  }, [
    pathname,
    config.main,
    workspaceSlug,
    projectSlug,
    activeMenuId,
    setActiveMenuId,
  ]);

  const handleBack = () => {
    userDismissedRef.current = true;
    setActiveMenuId(null);
  };

  return (
    <div className="hidden h-screen border-r border-neutral-200/70 bg-neutral-100/60 lg:sticky lg:top-0 lg:block overflow-hidden dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-[55px] w-full shrink-0 items-center border-b border-neutral-100 dark:border-neutral-800">
          <WorkspaceSwitcher />
        </div>

        <SidebarFinder />

        <div className="flex-1 overflow-y-auto py-2">
          <div className="relative h-full overflow-hidden">
            {/* Pane A: root menu */}
            <div
              className={cn(
                "transition-transform duration-200 ease-in-out",
                activeMenuId ? "-translate-x-full" : "translate-x-0",
              )}
            >
              <nav className="grid items-start px-2 text-sm font-normal">
                {config.main.map((section) => (
                  <SidebarSection
                    key={section.id || section.title || "top"}
                    section={section}
                    workspaceSlug={workspaceSlug}
                    projectSlug={projectSlug}
                    pathname={pathname}
                    onDrillDown={setActiveMenuId}
                  />
                ))}
                <Separator className="my-3" />
                {config.bottom.map((item) => {
                  const href = buildHref(
                    workspaceSlug,
                    projectSlug,
                    item.segment,
                  );
                  return (
                    <SidebarNavItem
                      key={item.segment}
                      item={item}
                      href={href}
                      active={isItemActive(pathname, href, item.segment)}
                    />
                  );
                })}
              </nav>
            </div>

            {/* Pane B: drill-down */}
            <div
              className={cn(
                "absolute inset-0 transition-transform duration-200 ease-in-out",
                activeMenuId ? "translate-x-0" : "translate-x-full",
              )}
            >
              {activeDrillSection && (
                <nav className="grid items-start px-2 text-sm font-normal">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-normal text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50 mb-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {activeDrillSection.title}
                  </button>
                  <Separator className="mb-2" />
                  {(() => {
                    const childHrefs = (activeDrillSection.children ?? []).map(
                      (item) => ({
                        item,
                        href: buildHref(
                          workspaceSlug,
                          projectSlug,
                          item.segment,
                        ),
                      }),
                    );
                    const activeHref = resolveMostSpecificActiveHref(
                      pathname,
                      childHrefs.map((c) => c.href),
                    );
                    return childHrefs.map(({ item, href }) => (
                      <SidebarNavItem
                        key={item.segment}
                        item={item}
                        href={href}
                        active={href === activeHref}
                      />
                    ));
                  })()}
                </nav>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-100 p-2 dark:border-neutral-800">
          <SidebarUserMenu />
        </div>
      </div>
    </div>
  );
}
