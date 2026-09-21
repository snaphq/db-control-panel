"use client";

import { clearAnalyticsCache } from "@/components/analytics/use-analytics";
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandKbd,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { signOut } from "@repo/auth/client";
import {
  Building2,
  Home,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Wallet,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null,
  );
  const { setTheme } = useTheme();
  const router = useRouter();

  // Fetch workspaces on mount
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await fetch("/api/auth/organization/list");
        if (!response.ok) return;

        const result = await response.json();
        const organizations = Array.isArray(result)
          ? result
          : result?.data || [];

        if (organizations.length > 0) {
          setWorkspaces(organizations);
          const active =
            organizations.find((org: Workspace) => org.isActive) ||
            organizations[0];
          setActiveWorkspace(active);
        }
      } catch (error) {
        console.error("Failed to fetch workspaces:", error);
      }
    };

    fetchWorkspaces();
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const handleNavigation = useCallback(
    (path: string) => {
      runCommand(() => router.push(path));
    },
    [router, runCommand],
  );

  const handleSwitchWorkspace = useCallback(
    async (workspace: Workspace) => {
      setOpen(false);

      try {
        const response = await fetch("/api/auth/organization/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: workspace.id }),
        });

        if (!response.ok) {
          const result = await response.json();
          toast.error(result.error?.message || "Failed to switch workspace");
          return;
        }

        const result = await response.json();
        if (result.error) {
          toast.error(result.error.message || "Failed to switch workspace");
          return;
        }

        setActiveWorkspace(workspace);
        toast.success(`Switched to ${workspace.name}`);
        router.refresh();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to switch workspace";
        toast.error(message);
      }
    },
    [router],
  );

  const handleSignOut = useCallback(async () => {
    setOpen(false);

    try {
      clearAnalyticsCache();
      const result = await signOut();

      if (result?.error) {
        console.error("Sign out error:", result.error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Error during sign out:", error);
      router.push("/");
      router.refresh();
    }
  }, [router]);

  const handleTheme = useCallback(
    (theme: string) => {
      runCommand(() => setTheme(theme));
    },
    [runCommand, setTheme],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-[220px] items-center gap-2 rounded-md border border-neutral-200/70 bg-white/60 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-white hover:text-foreground dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:bg-neutral-900 dark:hover:text-foreground"
        title="Search (⌘K)"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <CommandKbd>⌘</CommandKbd>
          <CommandKbd>K</CommandKbd>
        </span>
        <span className="sr-only">Open command menu</span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Type a command or search..."
          rightSlot={<CommandKbd>esc</CommandKbd>}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Navigation */}
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => handleNavigation("/dashboard")}>
              <Home />
              <span>Home</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleNavigation("/dashboard/finance")}
            >
              <Wallet />
              <span>Finance</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleNavigation("/dashboard/settings")}
            >
              <Settings />
              <span>Settings</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Workspaces */}
          <CommandGroup heading="Workspaces">
            {workspaces.map((workspace) => (
              <CommandItem
                key={workspace.id}
                onSelect={() => handleSwitchWorkspace(workspace)}
              >
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-violet-500 text-[9px] font-medium text-white">
                  {workspace.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{workspace.name}</span>
                {activeWorkspace?.id === workspace.id && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Active
                  </span>
                )}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => handleNavigation("/workspace/new")}>
              <Building2 />
              <span>Create new workspace</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Theme */}
          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => handleTheme("light")}>
              <Sun />
              <span>Light</span>
            </CommandItem>
            <CommandItem onSelect={() => handleTheme("dark")}>
              <Moon />
              <span>Dark</span>
            </CommandItem>
            <CommandItem onSelect={() => handleTheme("system")}>
              <Monitor />
              <span>System</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Account */}
          <CommandGroup heading="Account">
            <CommandItem
              onSelect={() => handleNavigation("/auth/user-profile")}
            >
              <User />
              <span>Profile</span>
            </CommandItem>
            <CommandItem onSelect={handleSignOut}>
              <LogOut />
              <span>Sign out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <CommandFooter />
      </CommandDialog>
    </>
  );
}
