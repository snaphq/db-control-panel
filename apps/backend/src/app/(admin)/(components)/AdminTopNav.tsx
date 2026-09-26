"use client";

import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { AdminCommandMenu } from "@/components/admin/admin-command-menu";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { ModeToggle } from "@repo/ui/components/ModeToggle";
import { Button } from "@repo/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import {
  Activity,
  Building2,
  CreditCard,
  DollarSign,
  FolderKanban,
  LayoutDashboard,
  Package,
  Settings,
  Tag,
  Ticket,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AdminTopNav({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/users", icon: Users, label: "Users" },
    { href: "/organizations", icon: Building2, label: "Organizations" },
    { href: "/projects", icon: FolderKanban, label: "Projects" },
    { href: "/members", icon: UserCog, label: "Members" },
    { href: "/payments", icon: CreditCard, label: "Payments" },
    { href: "/sessions", icon: Activity, label: "Sessions" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const stripeItems = [
    { href: "/stripe/products", icon: Package, label: "Products" },
    { href: "/stripe/prices", icon: DollarSign, label: "Prices" },
    { href: "/stripe/coupons", icon: Ticket, label: "Coupons" },
    { href: "/stripe/promo-codes", icon: Tag, label: "Promo Codes" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-6 lg:h-[55px]">
        <Sheet>
          <SheetTrigger className="min-[1024px]:hidden p-2 transition">
            <HamburgerMenuIcon />
            <span className="sr-only">Menu</span>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <Link href="/dashboard">
                <SheetTitle>Admin Portal</SheetTitle>
              </Link>
            </SheetHeader>
            <div className="flex flex-col space-y-3 mt-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                          ? "default"
                          : "outline"
                      }
                      className="w-full"
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}

              <div className="pt-3 pb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  Stripe Management
                </p>
              </div>

              {stripeItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                          ? "default"
                          : "outline"
                      }
                      className="w-full"
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex justify-center items-center gap-3 ml-auto">
          <AdminCommandMenu />
          <AdminAccountMenu email={adminEmail} />
          <ModeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
