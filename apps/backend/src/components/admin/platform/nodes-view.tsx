import {
  availabilityTone,
  formatBytes,
  formatCpu,
  formatTimestamp,
  safekeeperTone,
  schedulingTone,
} from "@/lib/platform/format";
import type { AdminNode } from "@repo/control-plane-contract";
import { StatePill } from "./state-pill";
import { SummaryCards } from "./summary-cards";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function NodeStatus({ node }: { node: AdminNode }) {
  if (node.missing) return <StatePill tone="bad">Missing</StatePill>;
  if (!node.ready) return <StatePill tone="warn">Not ready</StatePill>;
  return <StatePill tone="good">Ready</StatePill>;
}

function PageserverCell({ node }: { node: AdminNode }) {
  const { pageserver } = node;
  if (!pageserver) return <span className="text-muted-foreground">-</span>;
  if (!pageserver.registered) {
    return <StatePill tone="warn">Not registered</StatePill>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        <StatePill tone={availabilityTone(pageserver.availability)}>
          {pageserver.availability ?? "Unknown"}
        </StatePill>
        <StatePill tone={schedulingTone(pageserver.scheduling)}>
          {pageserver.scheduling
            ? `Scheduling ${pageserver.scheduling}`
            : "Scheduling unknown"}
        </StatePill>
      </div>
      <span className="text-xs text-muted-foreground">
        {pageserver.attached_shards === null
          ? "shards unknown"
          : plural(pageserver.attached_shards, "attached shard")}
      </span>
    </div>
  );
}

function SafekeeperCell({ node }: { node: AdminNode }) {
  if (node.safekeepers.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {node.safekeepers.map((sk) => (
        <span key={sk.id} className="flex items-center gap-1 text-xs">
          <span className="font-mono">#{sk.id}</span>
          <StatePill tone={safekeeperTone(sk.state)}>{sk.state}</StatePill>
        </span>
      ))}
    </div>
  );
}

function summarize(nodes: AdminNode[]) {
  const live = nodes.filter((n) => !n.missing);
  const pageservers = live.filter((n) => n.pageserver);
  const safekeepers = nodes.flatMap((n) => n.safekeepers);
  return {
    total: live.length,
    ready: live.filter((n) => n.ready).length,
    missing: nodes.length - live.length,
    pageservers: pageservers.length,
    pageserversActive: pageservers.filter(
      (n) => n.pageserver?.availability === "Active",
    ).length,
    safekeepers: safekeepers.length,
    safekeepersActive: safekeepers.filter((sk) => sk.state === "active").length,
    libsql: nodes.reduce((sum, n) => sum + n.libsql_databases, 0),
  };
}

export function NodesView({ nodes }: { nodes: AdminNode[] }) {
  const totals = summarize(nodes);
  return (
    <div className="flex flex-col gap-4">
      <SummaryCards
        items={[
          {
            title: "Nodes",
            value: totals.total,
            detail: `${totals.ready} ready, ${totals.total - totals.ready} not ready${totals.missing > 0 ? `, ${totals.missing} missing` : ""}`,
          },
          {
            title: "Pageservers",
            value: totals.pageservers,
            detail: `${totals.pageserversActive} active`,
          },
          {
            title: "Safekeepers",
            value: totals.safekeepers,
            detail: `${totals.safekeepersActive} active`,
          },
          {
            title: "libSQL databases",
            value: totals.libsql,
            detail: "live, across all nodes",
          },
        ]}
      />
      {nodes.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          No node has joined the cluster yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="h-12 px-4 font-medium">Node</th>
                <th className="h-12 px-4 font-medium">Zone</th>
                <th className="h-12 px-4 font-medium">Roles</th>
                <th className="h-12 px-4 font-medium">Status</th>
                <th className="h-12 px-4 font-medium">CPU</th>
                <th className="h-12 px-4 font-medium">Memory</th>
                <th className="h-12 px-4 font-medium">Storage</th>
                <th className="h-12 px-4 font-medium">Pageserver</th>
                <th className="h-12 px-4 font-medium">Safekeepers</th>
                <th className="h-12 px-4 font-medium">libSQL</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr
                  key={node.id}
                  className={`border-b align-top transition-colors hover:bg-muted/50 ${node.missing ? "opacity-60" : ""}`}
                >
                  <td className="p-4">
                    <div className="font-medium">{node.name}</div>
                    <div className="text-xs text-muted-foreground">
                      id {node.id} · {node.tailscale_ip}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      seen {formatTimestamp(node.updated_at)}
                    </div>
                  </td>
                  <td className="p-4">{node.zone}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {node.roles.map((role) => (
                        <StatePill key={role} tone="neutral">
                          {role}
                        </StatePill>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <NodeStatus node={node} />
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatCpu(node.allocatable.cpu_millis)}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatBytes(node.allocatable.memory_bytes)}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatBytes(node.allocatable.storage_bytes)}
                  </td>
                  <td className="p-4">
                    <PageserverCell node={node} />
                  </td>
                  <td className="p-4">
                    <SafekeeperCell node={node} />
                  </td>
                  <td className="p-4">{node.libsql_databases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
