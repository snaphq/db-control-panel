"use client";

import { signOut, useSession } from "@repo/auth/client";
import {
  BookOpen,
  ChevronsUpDown,
  FileText,
  Home,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "../../lib/utils";
import { clearAnalyticsCache } from "../analytics/use-analytics";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type UpgradeCta = { shouldShow: boolean; href?: string };

export function SidebarUserMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [cta, setCta] = React.useState<UpgradeCta>({ shouldShow: false });
  const [profile, setProfile] = React.useState<{
    name: string;
    email: string;
    image: string;
  } | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // The better-auth session can lag behind direct DB updates to the user row
  // (we update via /api/account, not via better-auth). Fetch the canonical
  // profile so the sidebar always shows the latest name/email/image.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProfile({
          name: data.name ?? "",
          email: data.email ?? "",
          image: data.image ?? "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const workspaceSlug =
    typeof params?.workspaceSlug === "string" ? params.workspaceSlug : null;

  React.useEffect(() => {
    if (!workspaceSlug) {
      setCta({ shouldShow: false });
      return;
    }
    let cancelled = false;
    fetch(`/api/billing/cta?slug=${encodeURIComponent(workspaceSlug)}`)
      .then((r) => (r.ok ? r.json() : { shouldShow: false }))
      .then((data: UpgradeCta) => {
        if (!cancelled) setCta(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const name = profile?.name ?? session?.user?.name ?? "";
  const email = profile?.email ?? session?.user?.email ?? "";
  const image = profile?.image ?? session?.user?.image ?? "";
  const initial = (name?.[0] || email?.[0] || "U").toUpperCase();

  const settingsHref = "/account/settings";

  const handleSignOut = async () => {
    try {
      clearAnalyticsCache();
      await signOut();
      await new Promise((resolve) => setTimeout(resolve, 100));
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Error during sign out:", error);
      router.push("/");
      router.refresh();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={image} alt={name || "User"} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-sm font-medium">
            {name || email || "Account"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72 p-0">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            {name ? (
              <>
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {email}
                </div>
              </>
            ) : (
              <div className="truncate text-sm font-medium">
                {email || "Account"}
              </div>
            )}
          </div>
          <Link
            href={settingsHref}
            aria-label="Settings"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem
            onClick={() => {
              // TODO: wire up feedback surface
            }}
            className="flex items-center justify-between"
          >
            <span>Feedback</span>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            className="flex items-center justify-between focus:bg-transparent"
          >
            <span>Theme</span>
            <div className="flex items-center rounded-full border bg-muted p-0.5">
              {(
                [
                  { value: "system", icon: Monitor, label: "System" },
                  { value: "light", icon: Sun, label: "Light" },
                  { value: "dark", icon: Moon, label: "Dark" },
                ] as const
              ).map(({ value, icon: Icon, label }) => {
                const active = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/" className="flex items-center justify-between">
              <span>Home Page</span>
              <Home className="h-4 w-4 text-muted-foreground" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/changelog"
              className="flex items-center justify-between"
            >
              <span>Changelog</span>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/help" className="flex items-center justify-between">
              <span>Help</span>
              <LifeBuoy className="h-4 w-4 text-muted-foreground" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/docs" className="flex items-center justify-between">
              <span>Docs</span>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="flex items-center justify-between"
          >
            <span>Log Out</span>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        </div>
        {cta.shouldShow && cta.href ? (
          <div className="px-3 pb-2">
            <Link
              href={cta.href}
              className="flex w-full items-center justify-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Upgrade to Pro
            </Link>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
          <div>
            <div className="font-medium">Platform Status</div>
            <div className="text-muted-foreground">All systems normal</div>
          </div>
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
