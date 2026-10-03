import { formatTimestamp, safekeeperTone } from "@/lib/platform/format";
import { describeLayout } from "@/lib/platform/layout";
import type {
  AdminSafekeeper,
  AdminSafekeeperLayout,
} from "@repo/control-plane-contract";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { Progress } from "@repo/react-ui/components/ui/progress";
import Link from "next/link";
import { StatePill } from "./state-pill";
import { SummaryCards } from "./summary-cards";

function Drain({ safekeeper }: { safekeeper: AdminSafekeeper }) {
  const { drain } = safekeeper;
  if (!drain) {
    return <span className="text-muted-foreground">-</span>;
  }
  const done = drain.total === 0 ? 100 : (drain.migrated / drain.total) * 100;
  return (
    <div className="flex min-w-48 flex-col gap-1">
      <Progress
        value={done}
        aria-label={`Safekeeper ${safekeeper.id} drain progress`}
      />
      <span className="text-xs">
        {drain.migrated} of {drain.total} timelines moved
        {drain.failed.length > 0 ? `, ${drain.failed.length} failed` : ""}
      </span>
      {drain.failed.map((failure) => (
        <span
          key={failure.timeline}
          className="text-xs text-red-700 dark:text-red-400"
        >
          <span className="font-mono">{failure.timeline}</span>:{" "}
          {failure.reason}
        </span>
      ))}
      <span className="text-xs text-muted-foreground">
        as of {formatTimestamp(drain.updated_at)}
      </span>
    </div>
  );
}

const LINE_DOT = {
  good: "bg-emerald-500",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  neutral: "bg-muted-foreground",
} as const;

export function SafekeepersView({
  safekeepers,
  layout,
  nodeNames,
}: {
  safekeepers: AdminSafekeeper[];
  layout: AdminSafekeeperLayout;
  nodeNames: ReadonlyMap<number, string>;
}) {
  const count = (state: AdminSafekeeper["state"]) =>
    safekeepers.filter((sk) => sk.state === state).length;
  const lines = describeLayout(layout, safekeepers, nodeNames);
  return (
    <div className="flex flex-col gap-4">
      <SummaryCards
        items={[
          {
            title: "Wanted",
            value: layout.desired_count,
            detail: "safekeepers",
          },
          {
            title: "Active",
            value: count("active"),
            detail: "serving timelines",
          },
          {
            title: "Starting",
            value: count("creating"),
            detail: "being created or registered",
          },
          {
            title: "Retiring",
            value: count("retiring"),
            detail: `moving timelines away; ${count("retired")} retired so far`,
          },
        ]}
      />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Layout</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {lines.map((line) => (
              <li key={line.text} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LINE_DOT[line.tone]}`}
                />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {safekeepers.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          No safekeeper has been created yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="h-12 px-4 font-medium">Safekeeper</th>
                <th className="h-12 px-4 font-medium">Node</th>
                <th className="h-12 px-4 font-medium">State</th>
                <th className="h-12 px-4 font-medium">Drain</th>
                <th className="h-12 px-4 font-medium">Created</th>
                <th className="h-12 px-4 font-medium">Operation</th>
              </tr>
            </thead>
            <tbody>
              {safekeepers.map((sk) => (
                <tr
                  key={sk.id}
                  className={`border-b align-top transition-colors hover:bg-muted/50 ${sk.state === "retired" ? "opacity-60" : ""}`}
                >
                  <td className="p-4">
                    <div className="font-medium">#{sk.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {sk.availability_zone} · {sk.hostname}
                    </div>
                  </td>
                  <td className="p-4">{sk.node_name}</td>
                  <td className="p-4">
                    <StatePill tone={safekeeperTone(sk.state)}>
                      {sk.state}
                    </StatePill>
                    {sk.retired_at ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatTimestamp(sk.retired_at)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-4">
                    <Drain safekeeper={sk} />
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {formatTimestamp(sk.created_at)}
                  </td>
                  <td className="p-4">
                    {sk.operation_id ? (
                      <Link
                        className="font-mono text-xs underline"
                        href={`/platform/operations/${sk.operation_id}`}
                      >
                        {sk.operation_id}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">initial</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
