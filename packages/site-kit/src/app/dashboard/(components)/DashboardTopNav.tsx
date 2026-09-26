"use client";

import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { CommandMenu } from "@repo/ui/components/dashboard/command-menu";
import { InvitationBell } from "@repo/ui/components/dashboard/invitation-bell";
import { ProjectSwitcher } from "@repo/ui/components/dashboard/project-switcher";
import { useSidebar } from "@repo/ui/components/dashboard/sidebar-context";
import { SidebarUserMenu } from "@repo/ui/components/dashboard/sidebar-user-menu";
import { Button } from "@repo/ui/components/ui/button";
import { Separator } from "@repo/ui/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { Folder, HomeIcon, PanelLeft, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

export default function DashboardTopNav({ children }: { children: ReactNode }) {
  const { toggle } = useSidebar();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectSlug = params.projectSlug as string;

  // Build dynamic URLs based on current workspace/project
  const homeUrl =
    workspaceSlug && projectSlug
      ? `/dashboard/${workspaceSlug}/${projectSlug}`
      : "/dashboard";
  const financeUrl =
    workspaceSlug && projectSlug
      ? `/dashboard/${workspaceSlug}/${projectSlug}/finance`
      : "/dashboard";
  const settingsUrl = workspaceSlug
    ? `/dashboard/${workspaceSlug}/~/settings`
    : "/dashboard";
  const membersUrl = workspaceSlug
    ? `/dashboard/${workspaceSlug}/~/settings/members`
    : "/dashboard";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-6 lg:h-[55px]">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation menu"
            >
              <HamburgerMenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <Link href="/">
                <SheetTitle>Nextjs Starter Kit</SheetTitle>
              </Link>
            </SheetHeader>

            {/* Project Switcher for mobile */}
            <div className="mt-4 mb-2">
              <ProjectSwitcher />
            </div>

            <div className="flex flex-col space-y-3 mt-4">
              <SheetClose asChild>
                <Link href={homeUrl}>
                  <Button variant="outline" className="w-full">
                    <HomeIcon className="mr-2 h-4 w-4" />
                    Home
                  </Button>
                </Link>
              </SheetClose>

              <SheetClose asChild>
                <Link href={financeUrl}>
                  <Button variant="outline" className="w-full">
                    <Folder className="mr-2 h-4 w-4" />
                    Finance
                  </Button>
                </Link>
              </SheetClose>
              <Separator className="my-3" />
              <SheetClose asChild>
                <Link href={settingsUrl}>
                  <Button variant="outline" className="w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href={membersUrl}>
                  <Button variant="outline" className="w-full">
                    <Users className="mr-2 h-4 w-4" />
                    Members
                  </Button>
                </Link>
              </SheetClose>
            </div>
            <div className="mt-auto border-t pt-3">
              <SidebarUserMenu />
            </div>
          </SheetContent>
        </Sheet>

        {/* Sidebar toggle + Project Switcher - left side, desktop only */}
        <div className="hidden lg:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={toggle}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <ProjectSwitcher />
        </div>

        <div className="flex justify-center items-center gap-3 ml-auto">
          <CommandMenu />
          <InvitationBell />
        </div>
      </header>
      {children}
    </div>
  );
}
