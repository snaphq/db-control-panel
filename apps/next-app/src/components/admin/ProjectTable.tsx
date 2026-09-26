"use client";

import type { Organization, Project } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import Link from "next/link";
import { useState } from "react";

interface ProjectWithOrganization extends Project {
  organization?: Organization | null;
}

interface ProjectTableProps {
  projects: ProjectWithOrganization[];
  showOrganization?: boolean;
}

export function ProjectTable({
  projects: initialProjects,
  showOrganization = true,
}: ProjectTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects] = useState(initialProjects);

  const filteredProjects = projects.filter(
    (project) =>
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.organization?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Name
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Slug
              </th>
              {showOrganization && (
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Organization
                </th>
              )}
              <th className="h-12 px-4 text-left align-middle font-medium">
                Default
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Created
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => (
              <tr
                key={project.id}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="p-4 align-middle">{project.name}</td>
                <td className="p-4 align-middle font-mono text-sm">
                  {project.slug}
                </td>
                {showOrganization && (
                  <td className="p-4 align-middle">
                    {project.organization ? (
                      <Link
                        href={`/adminx/organizations/${project.organizationId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {project.organization.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                )}
                <td className="p-4 align-middle">
                  {project.isDefault ? (
                    <Badge variant="secondary">Default</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {new Date(project.createdAt).toLocaleDateString()}
                </td>
                <td className="p-4 align-middle">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/adminx/projects/${project.id}`}>View</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProjects.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No projects found
          </div>
        )}
      </div>
    </div>
  );
}
