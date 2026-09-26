"use client";

import type { SearchWarning } from "@repo/search";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { ProjectCard, type ProjectCardProject } from "./ProjectCard";
import { ProjectsToolbar, type ViewMode } from "./ProjectsToolbar";
import { AlertsCard, RecentActivityCard, UsageCard } from "./SideRailCards";

const VIEW_STORAGE_KEY = "projects:view";

interface ProjectsOverviewProps {
  workspaceSlug: string;
  orgName: string;
  organizationId: string;
  canManageMembers: boolean;
  projects: ProjectCardProject[];
}

export function ProjectsOverview({
  workspaceSlug,
  orgName,
  organizationId,
  canManageMembers,
  projects,
}: ProjectsOverviewProps) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [remoteResults, setRemoteResults] = useState<
    ProjectCardProject[] | null
  >(null);
  const [searchWarnings, setSearchWarnings] = useState<SearchWarning[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {}
  }, []);

  useEffect(() => {
    const query = deferredSearch.trim();
    if (!query) {
      setRemoteResults(null);
      setSearchWarnings([]);
      setSearchError(null);
      return;
    }

    setRemoteResults(null);
    setSearchWarnings([]);
    setSearchError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          organizationId,
          query,
        });
        const response = await fetch(`/api/search/projects?${params}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          error?: string;
          results?: ProjectCardProject[];
          warnings?: SearchWarning[];
        };
        if (!response.ok) throw new Error(payload.error || "Search failed");
        setRemoteResults(payload.results ?? []);
        setSearchWarnings(payload.warnings ?? []);
        setSearchError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRemoteResults(null);
        setSearchWarnings([]);
        setSearchError(
          error instanceof Error ? error.message : "Search failed",
        );
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [deferredSearch, organizationId]);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {}
  };

  const needle = deferredSearch.trim().toLowerCase();
  const localFiltered = needle
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.slug.toLowerCase().includes(needle) ||
          (p.description?.toLowerCase().includes(needle) ?? false),
      )
    : projects;
  const filtered = remoteResults ?? localFiltered;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="sr-only">
          {orgName} — {projects.length} project
          {projects.length !== 1 ? "s" : ""}
        </h1>
        <ProjectsToolbar
          workspaceSlug={workspaceSlug}
          organizationId={organizationId}
          canManageMembers={canManageMembers}
          search={search}
          onSearchChange={setSearch}
          view={view}
          onViewChange={handleViewChange}
        />
        {searchWarnings.length > 0 && (
          <output className="mt-2 block text-xs text-muted-foreground">
            {searchWarnings.map((item) => item.message).join(" ")}
          </output>
        )}
        {searchError && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {searchError}
          </p>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-medium">No projects yet</h2>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Create your first project to get started.
          </p>
          <Button asChild>
            <Link
              href={`/dashboard/${encodeURIComponent(workspaceSlug)}/~/projects/new`}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <aside className="order-2 space-y-8 md:order-1">
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-tight">Usage</h2>
              <UsageCard workspaceSlug={workspaceSlug} />
            </section>
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-tight">
                Alerts
              </h2>
              <AlertsCard />
            </section>
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-tight">
                Recent activity
              </h2>
              <RecentActivityCard
                workspaceSlug={workspaceSlug}
                projects={projects}
              />
            </section>
          </aside>
          <section className="order-1 md:order-2">
            <h2 className="mb-3 text-sm font-medium tracking-tight">
              Projects
            </h2>
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No projects match &ldquo;{search}&rdquo;.
              </div>
            ) : (
              <div
                className={cn(
                  view === "grid"
                    ? "grid grid-cols-1 gap-4 xl:grid-cols-2"
                    : "flex flex-col gap-2",
                )}
              >
                {filtered.map((p) => (
                  <ProjectCard
                    key={p.id}
                    workspaceSlug={workspaceSlug}
                    project={p}
                    variant={view}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
