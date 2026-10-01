"use client";

import type {
  Database,
  Endpoint,
  EndpointState,
  Role,
} from "@repo/control-plane-contract";
import { useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ActionButton } from "./action-button";
import { ConnectionStringsPanel } from "./connection-strings-panel";
import type { NeonActions } from "./neon-actions";

const STATE_LABEL: Record<EndpointState, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  suspending: "Suspending",
};

function stateVariant(state: EndpointState) {
  return state === "running" ? "default" : "secondary";
}

function formatTimeout(seconds: number): string {
  if (seconds === 0) return "never suspends";
  if (seconds % 3600 === 0) return `suspends after ${seconds / 3600} h`;
  if (seconds % 60 === 0) return `suspends after ${seconds / 60} min`;
  return `suspends after ${seconds} s`;
}

interface NeonEndpointRowProps {
  neonId: string;
  endpoint: Endpoint;
  roles: Role[];
  databases: Database[];
  actions: NeonActions;
}

export function NeonEndpointRow({
  neonId,
  endpoint,
  roles,
  databases,
  actions,
}: NeonEndpointRowProps) {
  const [showConnection, setShowConnection] = useState(false);
  const transitional =
    endpoint.state === "starting" || endpoint.state === "suspending";

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{endpoint.id}</span>
        <Badge variant={stateVariant(endpoint.state)}>
          {STATE_LABEL[endpoint.state]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {endpoint.type === "read_write" ? "Read-write" : "Read-only"} ·{" "}
          {endpoint.compute_size} CU ·{" "}
          {formatTimeout(endpoint.suspend_timeout_seconds)}
        </span>
        <div className="ml-auto flex gap-2">
          {actions.canManage && endpoint.state === "idle" && (
            <ActionButton
              size="sm"
              variant="outline"
              onAction={() =>
                actions.endpointAction(neonId, endpoint.id, "start")
              }
            >
              Start
            </ActionButton>
          )}
          {actions.canManage && endpoint.state === "running" && (
            <ActionButton
              size="sm"
              variant="outline"
              onAction={() =>
                actions.endpointAction(neonId, endpoint.id, "suspend")
              }
            >
              Suspend
            </ActionButton>
          )}
          {actions.canManage && transitional && (
            <Button size="sm" variant="outline" disabled>
              {STATE_LABEL[endpoint.state]}...
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowConnection((open) => !open)}
          >
            {showConnection ? "Hide connection" : "Connect"}
          </Button>
        </div>
      </div>
      {showConnection && (
        <ConnectionStringsPanel
          endpoint={endpoint}
          roles={roles}
          databases={databases}
        />
      )}
    </div>
  );
}
