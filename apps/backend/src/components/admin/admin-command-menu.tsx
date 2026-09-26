"use client";

import { adminNav } from "@/lib/navigation";
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
} from "@repo/ui/components/ui/command";
import {
  Home,
  LogOut,
  Monitor,
  Moon,
  Package,
  Search,
  Sun,
  Tag,
  Ticket,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function AdminCommandMenu() {
  const [open, setOpen] = useState(false);
  const { setTheme } = useTheme();
  const router = useRouter();

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

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    try {
      await fetch("/logout", { method: "POST" });
    } catch (error) {
      console.error("Error during sign out:", error);
    }
    router.push("/login");
    router.refresh();
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
        className="flex h-8 w-full max-w-[260px] items-center gap-2 rounded-md border border-neutral-200/70 bg-white/60 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-white hover:text-foreground dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:bg-neutral-900 dark:hover:text-foreground"
        title="Search admin (⌘K)"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Search admin...</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <CommandKbd>⌘</CommandKbd>
          <CommandKbd>K</CommandKbd>
        </span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search admin commands..."
          rightSlot={<CommandKbd>esc</CommandKbd>}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Navigation — derived from sidebar config */}
          {adminNav.main.map((section, idx) => {
            const items = [...section.items, ...(section.children ?? [])];
            if (items.length === 0) return null;
            const heading = section.title || "Navigation";
            return (
              <div key={section.id ?? `${heading}-${idx}`}>
                <CommandGroup heading={heading}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.href}
                        onSelect={() => handleNavigation(item.href)}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </div>
            );
          })}

          {/* Quick Actions */}
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => handleNavigation("/stripe/products/new")}
            >
              <Package />
              <span>Create new product</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleNavigation("/stripe/coupons/new")}
            >
              <Ticket />
              <span>Create new coupon</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleNavigation("/stripe/promo-codes/new")}
            >
              <Tag />
              <span>Create new promo code</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Switch Context */}
          <CommandGroup heading="Switch Context">
            <CommandItem onSelect={() => handleNavigation("/dashboard")}>
              <Home />
              <span>Go to user dashboard</span>
            </CommandItem>
            <CommandItem onSelect={() => handleNavigation("/")}>
              <Home />
              <span>Go to home</span>
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
