import { Button } from "@repo/react-ui/components/ui/button";
import { Card } from "@repo/react-ui/components/ui/card";
import { formatDistanceToNowStrict } from "date-fns";
import { BellRing } from "lucide-react";
import Link from "next/link";
import type { ProjectCardProject } from "./ProjectCard";

interface UsageCardProps {
  workspaceSlug: string;
}

export function UsageCard({ workspaceSlug }: UsageCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Last 30 days</span>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
        >
          <Link
            href={`/dashboard/${encodeURIComponent(workspaceSlug)}/~/settings/billing`}
          >
            Billing
          </Link>
        </Button>
      </div>
      <ul className="mt-4 space-y-2.5 text-xs">
        {["Emails sent", "Deliverability", "Contacts", "Active campaigns"].map(
          (label) => (
            <li
              key={label}
              className="flex items-center justify-between text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full border border-muted-foreground/40"
                />
                {label}
              </span>
              <span>—</span>
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}

export function AlertsCard() {
  return (
    <Card className="p-6 text-center">
      <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BellRing className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-medium">Get alerted for anomalies</h3>
      <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted-foreground">
        Automatically monitor your projects for anomalies and get notified.
      </p>
      <Button variant="outline" size="sm" className="mt-4" disabled>
        Coming soon
      </Button>
    </Card>
  );
}

interface RecentActivityCardProps {
  workspaceSlug: string;
  projects: ProjectCardProject[];
}

export function RecentActivityCard({
  workspaceSlug,
  projects,
}: RecentActivityCardProps) {
  const recent = [...projects]
    .sort((a, b) => {
      const aT = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bT = new Date(b.updatedAt ?? b.createdAt).getTime();
      return bT - aT;
    })
    .slice(0, 3);

  if (recent.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Recently updated projects will appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y p-0">
      {recent.map((p) => {
        const ts = new Date(p.updatedAt ?? p.createdAt);
        const href = `/dashboard/${encodeURIComponent(workspaceSlug)}/${p.slug}`;
        return (
          <Link
            key={p.id}
            href={href}
            className="flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-accent"
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatDistanceToNowStrict(ts, { addSuffix: true })}
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
