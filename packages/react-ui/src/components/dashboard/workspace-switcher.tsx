"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useCreateWorkspace } from "../workspace/create/CreateWorkspaceContext";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

interface WorkspaceListResponse {
  data?: Workspace[];
}

interface ApiErrorResponse {
  error?: { message?: string };
}

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
];

function getAvatarColor(name: string): string {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function WorkspaceAvatar({
  name,
  className,
}: { name: string; className?: string }) {
  return (
    <Avatar className={cn("h-5 w-5 shrink-0", className)}>
      <AvatarFallback
        className={cn(
          getAvatarColor(name),
          "text-white text-[10px] font-medium",
        )}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();

  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await fetch("/api/auth/organization/list");
        if (!response.ok) {
          console.error("Failed to fetch workspaces");
          setIsLoading(false);
          return;
        }
        const result: Workspace[] | WorkspaceListResponse =
          await response.json();

        const organizations = Array.isArray(result)
          ? result
          : Array.isArray(result.data)
            ? result.data
            : [];

        if (organizations.length > 0) {
          setWorkspaces(organizations);
          const active =
            organizations.find((org) => org.isActive) || organizations[0];
          setActiveWorkspace(active);
        }
      } catch (error) {
        console.error("Failed to fetch workspaces:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  const handleSwitchWorkspace = async (workspace: Workspace) => {
    try {
      const response = await fetch("/api/auth/organization/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: workspace.id }),
      });

      if (!response.ok) {
        const result: ApiErrorResponse = await response.json();
        toast.error(result.error?.message || "Failed to switch workspace");
        return;
      }

      const switchResult: ApiErrorResponse = await response.json();
      if (switchResult.error) {
        toast.error(switchResult.error.message || "Failed to switch workspace");
        return;
      }

      setActiveWorkspace(workspace);
      setOpen(false);
      toast.success("Workspace switched successfully");
      router.push(`/dashboard/${encodeURIComponent(workspace.slug)}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to switch workspace";
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <Button variant="ghost" className="w-full justify-start" disabled>
        <div className="mr-2 h-5 w-5 rounded-full bg-muted" />
        Loading...
      </Button>
    );
  }

  if (!activeWorkspace) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => createWorkspace.open()}
      >
        <Plus className="mr-2 h-4 w-4" />
        Create Workspace
      </Button>
    );
  }

  const currentWorkspace = activeWorkspace ?? workspaces[0];

  if (!currentWorkspace) {
    return null;
  }

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-[55px] w-full items-center">
      <Button
        variant="ghost"
        asChild
        className="min-w-0 flex-1 justify-start px-3 h-full rounded-none font-medium"
      >
        <Link href={`/dashboard/${encodeURIComponent(currentWorkspace.slug)}`}>
          <WorkspaceAvatar name={currentWorkspace.name} className="mr-2" />
          <span className="truncate">{currentWorkspace.name}</span>
        </Link>
      </Button>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-10 shrink-0 rounded-none text-muted-foreground focus-visible:ring-0 focus-visible:outline-none"
            aria-label="Switch workspace"
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          alignOffset={-10}
          className="w-[260px] p-0"
        >
          {/* Search */}
          <div className="flex items-center px-3 py-2 border-b">
            <input
              aria-label="Search teams"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find Team..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="text-xs text-muted-foreground">Esc</span>
          </div>

          {/* Workspace list */}
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No teams found
              </p>
            )}
            {filtered.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => handleSwitchWorkspace(workspace)}
                className={cn(
                  "cursor-pointer gap-2",
                  workspace.id === currentWorkspace.id && "bg-accent",
                )}
              >
                <WorkspaceAvatar name={workspace.name} />
                <span className="truncate flex-1">{workspace.name}</span>
                {workspace.id === currentWorkspace.id && (
                  <Check className="h-4 w-4 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator />

          {/* Create Team */}
          <div className="p-1">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOpen(false);
                createWorkspace.open();
              }}
              className="cursor-pointer flex items-start gap-3 py-2"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border mt-0.5">
                <Plus className="h-3 w-3" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Create Workspace</span>
                <span className="text-xs text-muted-foreground">
                  Collaborate with others in a shared workspace
                </span>
              </div>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
