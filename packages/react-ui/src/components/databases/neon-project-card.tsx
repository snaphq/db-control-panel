"use client";

import type { NeonProjectView } from "@repo/core/control-plane/overview";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { CreateBranchDialog } from "./create-branch-dialog";
import type { NeonActions } from "./neon-actions";
import { NeonBranchSection } from "./neon-branch-section";

interface NeonProjectCardProps {
  view: NeonProjectView;
  actions: NeonActions;
}

export function NeonProjectCard({ view, actions }: NeonProjectCardProps) {
  const { project, branches, endpoints } = view;
  const names = new Map(branches.map((b) => [b.branch.id, b.branch.name]));
  const branchChoices = branches.map(({ branch }) => ({
    id: branch.id,
    name: branch.name,
    isDefault: branch.is_default,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>
            Postgres {project.pg_version} · {branches.length}{" "}
            {branches.length === 1 ? "branch" : "branches"} · history kept{" "}
            {Math.round(project.history_retention_seconds / 3600)} h
          </CardDescription>
        </div>
        {actions.canManage && (
          <div className="flex gap-2">
            <CreateBranchDialog
              branches={branchChoices}
              onCreate={(body) => actions.createBranch(project.id, body)}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New branch
                </Button>
              }
            />
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => actions.requestDeleteProject(project)}
            >
              Delete
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {branches.map((view) => (
          <NeonBranchSection
            key={view.branch.id}
            neonId={project.id}
            view={view}
            parentName={
              view.branch.parent_id
                ? (names.get(view.branch.parent_id) ?? null)
                : null
            }
            endpoints={endpoints.filter((e) => e.branch_id === view.branch.id)}
            actions={actions}
          />
        ))}
      </CardContent>
    </Card>
  );
}
