"use client";

import type { Agent, AgentInstallation } from "@repo/database";
import { Bot, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

type Props = {
  projectId: string;
  agents: Agent[];
  installations: AgentInstallation[];
};

export function AgentsBrowser({ projectId, agents, installations }: Props) {
  const router = useRouter();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const installedByAgentId = new Map(
    installations.map((i) => [i.agentId, i] as const),
  );

  async function handleInstall(agentSlug: string) {
    setPendingSlug(agentSlug);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/agent-installations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentSlug }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Install failed");
      toast.success("Agent installed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed");
    } finally {
      setPendingSlug(null);
    }
  }

  async function handleUninstall(installationId: string, slug: string) {
    setPendingSlug(slug);
    try {
      const res = await fetch(`/api/agent-installations/${installationId}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Uninstall failed");
      toast.success("Agent uninstalled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Uninstall failed");
    } finally {
      setPendingSlug(null);
    }
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No agents available yet. An admin can publish agents from the admin
          portal.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((a) => {
        const installed = installedByAgentId.get(a.id);
        const busy = pendingSlug === a.slug;
        return (
          <Card key={a.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  {a.name}
                </CardTitle>
                {a.status !== "active" && (
                  <Badge variant="outline" className="capitalize">
                    {a.status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {a.slug}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {a.description ?? "No description."}
              </p>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="capitalize">
                  {a.category}
                </Badge>
                {installed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => handleUninstall(installed.id, a.slug)}
                  >
                    {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Uninstall
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => handleInstall(a.slug)}
                  >
                    {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Install
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
