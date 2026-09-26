"use client";

import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import { Card } from "@repo/react-ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/react-ui/components/ui/dropdown-menu";
import { cn } from "@repo/react-ui/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowUpRight,
  Link as LinkIcon,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { toast } from "sonner";
import { ProjectAvatar } from "./project-avatar";

export interface ProjectCardProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  updatedAt: Date | string | null;
  createdAt: Date | string;
}

interface ProjectCardProps {
  workspaceSlug: string;
  project: ProjectCardProject;
  variant?: "grid" | "list";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ProjectCard({
  workspaceSlug,
  project,
  variant = "grid",
}: ProjectCardProps) {
  const href = `/dashboard/${encodeURIComponent(workspaceSlug)}/${project.slug}`;
  const settingsHref = `${href}/~/settings`;
  const lastTouched = toDate(project.updatedAt) ?? toDate(project.createdAt);
  const isActive =
    lastTouched !== null &&
    Date.now() - lastTouched.getTime() < 7 * 24 * 60 * 60 * 1000;
  const subtitle =
    project.description?.trim() || `${workspaceSlug}/${project.slug}`;
  const relative = lastTouched
    ? formatDistanceToNowStrict(lastTouched, { addSuffix: true })
    : null;

  const copyLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${href}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Project link copied"),
      () => toast.error("Failed to copy link"),
    );
  }, [href]);

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground opacity-70 group-hover:opacity-100"
          aria-label={`Actions for ${project.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={href}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copyLink}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const activityDot = (
    <span
      aria-hidden
      title={relative ?? undefined}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
      )}
    />
  );

  if (variant === "list") {
    return (
      <Card className="group relative flex items-center gap-3 p-3 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
        <Link
          href={href}
          aria-label={`Open ${project.name}`}
          className="absolute inset-0 z-0 rounded-lg focus:outline-none"
        />
        <div className="pointer-events-none relative z-[1] flex flex-1 items-center gap-3">
          <ProjectAvatar id={project.id} name={project.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {project.name}
              </span>
              {project.isDefault && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  default
                </Badge>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          </div>
          {relative && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {relative}
            </span>
          )}
          <div className="shrink-0">{activityDot}</div>
        </div>
        <div className="pointer-events-auto relative z-[2] shrink-0">
          {actions}
        </div>
      </Card>
    );
  }

  return (
    <Card className="group relative flex min-h-[140px] flex-col p-5 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <Link
        href={href}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0 z-0 rounded-lg focus:outline-none"
      />
      <div className="pointer-events-none relative z-[1] flex items-start gap-3">
        <ProjectAvatar id={project.id} name={project.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{project.name}</span>
            {project.isDefault && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                default
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activityDot}
          <div className="pointer-events-auto">{actions}</div>
        </div>
      </div>
      <div className="pointer-events-none relative z-[1] mt-auto pt-6 text-xs text-muted-foreground">
        {relative ?? "—"}
      </div>
    </Card>
  );
}
