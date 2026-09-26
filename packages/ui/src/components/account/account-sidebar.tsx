"use client";

import { ArrowLeft, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import {
  type AccountNavItem,
  type AccountNavSection,
  accountNav,
} from "../../lib/account-navigation";
import { cn } from "../../lib/utils";
import { useSidebar } from "../dashboard/sidebar-context";
import { SidebarUserMenu } from "../dashboard/sidebar-user-menu";
import { Separator } from "../ui/separator";
import {
  SidebarDrillDownButton,
  SidebarGroupLabel,
  SidebarNavLink,
  resolveMostSpecificActiveHref,
} from "../ui/sidebar-nav";

function isActive(pathname: string, href: string) {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItemRow({
  item,
  active,
}: { item: AccountNavItem; active: boolean }) {
  return (
    <SidebarNavLink
      href={item.href}
      label={item.label}
      icon={item.icon}
      active={active}
    />
  );
}

function SidebarSection({
  section,
  pathname,
  onDrillDown,
}: {
  section: AccountNavSection;
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
      {section.items.map((item) => (
        <NavItemRow
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
        />
      ))}
    </div>
  );
}

export function AccountSidebar() {
  const pathname = usePathname();
  const { activeMenuId, setActiveMenuId } = useSidebar();

  const activeDrillSection = useMemo(
    () => accountNav.main.find((s) => s.id && s.id === activeMenuId) ?? null,
    [activeMenuId],
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
    for (const section of accountNav.main) {
      if (!section.id || !section.children) continue;
      for (const child of section.children) {
        if (isActive(pathname, child.href)) {
          setActiveMenuId(section.id);
          return;
        }
      }
    }
  }, [pathname, activeMenuId, setActiveMenuId]);

  const handleBack = () => {
    userDismissedRef.current = true;
    setActiveMenuId(null);
  };

  return (
    <div className="hidden h-screen border-r border-neutral-200/70 bg-neutral-100/60 lg:sticky lg:top-0 lg:block overflow-hidden dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-[55px] w-full shrink-0 items-center border-b border-neutral-100 px-2 dark:border-neutral-800">
          <Link
            href="/dashboard/"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <div className="relative h-full overflow-hidden">
            {/* Pane A: root menu */}
            <div
              className={cn(
                "transition-transform duration-200 ease-in-out",
                activeMenuId ? "-translate-x-full" : "translate-x-0",
              )}
            >
              <nav className="grid items-start px-2 text-sm font-medium">
                {accountNav.main.map((section) => (
                  <SidebarSection
                    key={section.id || section.title || "top"}
                    section={section}
                    pathname={pathname}
                    onDrillDown={setActiveMenuId}
                  />
                ))}
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
                <nav className="grid items-start px-2 text-sm font-medium">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50 mb-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {activeDrillSection.title}
                  </button>
                  <Separator className="mb-2" />
                  {(() => {
                    const children = activeDrillSection.children ?? [];
                    const activeHref = resolveMostSpecificActiveHref(
                      pathname,
                      children.map((c) => c.href),
                    );
                    return children.map((item) => (
                      <NavItemRow
                        key={item.href}
                        item={item}
                        active={item.href === activeHref}
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
