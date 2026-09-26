"use client";

import { Check, ChevronsUpDown, FolderKanban, Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  organizationId: string;
  isDefault: boolean;
}

interface Organization {
  id: string;
  slug: string;
}

export function ProjectSwitcher() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params.workspaceSlug as string;
  const projectSlug = params.projectSlug as string;
  const encodedWorkspaceSlug = encodeURIComponent(workspaceSlug);

  const [projects, setProjects] = useState<Project[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!workspaceSlug) {
        setIsLoading(false);
        return;
      }

      try {
        // First, get the organization by slug
        const orgsResponse = await fetch("/api/auth/organization/list");
        if (!orgsResponse.ok) {
          console.error("Failed to fetch organizations");
          setIsLoading(false);
          return;
        }

        const orgs = await orgsResponse.json();
        const orgList = Array.isArray(orgs) ? orgs : orgs?.data || [];
        const currentOrg = orgList.find(
          (org: Organization & { slug: string }) => org.slug === workspaceSlug,
        );

        if (!currentOrg) {
          console.error("Organization not found for slug:", workspaceSlug);
          setIsLoading(false);
          return;
        }

        setOrganization(currentOrg);

        // Then fetch projects for this organization
        const projectsResponse = await fetch(
          `/api/projects?organizationId=${currentOrg.id}`,
        );
        if (!projectsResponse.ok) {
          console.error("Failed to fetch projects");
          setIsLoading(false);
          return;
        }

        const projectsData = await projectsResponse.json();
        setProjects(Array.isArray(projectsData) ? projectsData : []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [workspaceSlug]);

  const currentProject = projects.find((p) => p.slug === projectSlug);

  if (isLoading) {
    return (
      <Button variant="ghost" className="justify-start gap-2" disabled>
        <FolderKanban className="h-4 w-4" />
        <span className="hidden sm:inline">Loading...</span>
      </Button>
    );
  }

  if (!workspaceSlug || !organization) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        asChild
        className="min-w-0 max-w-56 justify-start px-3"
      >
        <Link
          href={
            currentProject
              ? `/dashboard/${encodedWorkspaceSlug}/${currentProject.slug}`
              : `/dashboard/${encodedWorkspaceSlug}`
          }
        >
          {currentProject && <FolderKanban className="mr-2 h-4 w-4 shrink-0" />}
          <span className="truncate font-normal">
            {currentProject?.name || "All Projects"}
          </span>
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label="Switch project"
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} asChild>
              <Link
                href={`/dashboard/${encodedWorkspaceSlug}/${project.slug}`}
                className={cn(
                  "cursor-pointer",
                  project.slug === projectSlug && "bg-accent",
                )}
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                <span className="truncate">{project.name}</span>
                <div className="ml-auto flex items-center gap-2">
                  {project.isDefault ? (
                    <span className="text-xs text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                  {project.slug === projectSlug ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </div>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href={`/dashboard/${encodedWorkspaceSlug}/~/projects/new`}
              className="cursor-pointer"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {currentProject ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Return to workspace home"
          title="Return to workspace home"
          onClick={() => router.push(`/dashboard/${encodedWorkspaceSlug}`)}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
