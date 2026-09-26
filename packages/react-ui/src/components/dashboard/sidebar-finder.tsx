"use client";

import { Search, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FinderRow,
  flattenNav,
  projectNav,
  workspaceNav,
} from "../../lib/navigation";
import { cn } from "../../lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandKbd,
  CommandList,
  CommandSeparator,
} from "../ui/command";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

interface WorkspaceListResponse {
  data?: Workspace[];
}

export function SidebarFinder() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string | undefined;
  const projectSlug = params.projectSlug as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);

  const config = projectSlug ? projectNav : workspaceNav;
  const rows: FinderRow[] = useMemo(
    () => (workspaceSlug ? flattenNav(config, workspaceSlug, projectSlug) : []),
    [config, workspaceSlug, projectSlug],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/organization/list");
        if (!res.ok) return;
        const result: Workspace[] | WorkspaceListResponse = await res.json();
        const orgs = Array.isArray(result)
          ? result
          : Array.isArray(result.data)
            ? result.data
            : [];
        if (!cancelled) setWorkspaces(orgs);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (open) return;
      if (e.key.toLowerCase() !== "f") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const editable =
        !!active &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
          active.isContentEditable);
      if (editable) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const switchWorkspace = async (w: Workspace) => {
    setOpen(false);
    try {
      await fetch("/api/auth/organization/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: w.id }),
      });
      router.push(`/dashboard/${encodeURIComponent(w.slug)}`);
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={containerRef} className="relative px-2 pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-neutral-200/70 bg-white/60 px-2.5 text-sm text-gray-500 transition-colors hover:bg-white hover:text-gray-900 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-gray-400 dark:hover:bg-neutral-900 dark:hover:text-gray-50"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Find...</span>
          <CommandKbd>F</CommandKbd>
        </button>
      ) : (
        <div className="absolute inset-x-2 top-2 z-50 rounded-md border border-neutral-200 bg-popover shadow-lg dark:border-neutral-800">
          <Command>
            <CommandInput
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Find..."
              rightSlot={<CommandKbd>esc</CommandKbd>}
            />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>No results.</CommandEmpty>

              <CommandGroup heading="Navigation">
                {rows.map((row) => (
                  <CommandItem
                    key={row.href}
                    value={`${row.label} ${row.breadcrumb.join(" ")}`}
                    onSelect={() => go(row.href)}
                    className="gap-2"
                  >
                    <row.icon className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="flex-1 truncate">{row.label}</span>
                    {row.breadcrumb.length > 0 && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {row.breadcrumb.join(" / ")}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              {workspaces.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Workspaces">
                    {workspaces.map((w) => (
                      <CommandItem
                        key={w.id}
                        value={`workspace ${w.name}`}
                        onSelect={() => switchWorkspace(w)}
                        className="gap-2"
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-medium text-white",
                            "bg-violet-500",
                          )}
                        >
                          {w.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{w.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {query.trim().length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={`__assistant__ ${query}`}
                      onSelect={() => setOpen(false)}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="flex-1 truncate">
                        Navigation Assistant
                      </span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        "{query}"
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
