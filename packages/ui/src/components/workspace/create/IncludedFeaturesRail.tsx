import { Check, ExternalLink } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface RailFeature {
  title: string;
  subtitle: string;
  highlight?: boolean;
}

const DEFAULT_FEATURES: RailFeature[] = [
  {
    title: "Unlimited projects",
    subtitle: "Organize campaigns across teams",
    highlight: true,
  },
  {
    title: "Dedicated sending IPs",
    subtitle: "Protect sender reputation",
  },
  {
    title: "Warm-up automation",
    subtitle: "Gradually ramp new domains",
    highlight: true,
  },
  {
    title: "Deliverability monitoring",
    subtitle: "Inbox placement and spam signals",
  },
  {
    title: "A/B testing",
    subtitle: "Subject lines, copy, and schedules",
    highlight: true,
  },
  {
    title: "Advanced personalization",
    subtitle: "Dynamic variables and spintax",
  },
  {
    title: "Unified inbox",
    subtitle: "Replies across every mailbox",
  },
  {
    title: "Team seats",
    subtitle: "Collaborate with unlimited viewers",
    highlight: true,
  },
  {
    title: "SAML SSO and audit logs",
    subtitle: "Enterprise add-ons available",
  },
];

interface Props {
  features?: RailFeature[];
  pricingHref?: string;
}

export function IncludedFeaturesRail({
  features = DEFAULT_FEATURES,
  pricingHref = "/pricing",
}: Props) {
  return (
    <div className="flex h-full flex-col gap-4 border-r bg-muted/30 p-6">
      <h3 className="text-sm font-medium tracking-tight">
        What&rsquo;s included
      </h3>
      <ul className="flex flex-1 flex-col gap-0.5">
        {features.map((f) => (
          <li
            key={f.title}
            className={cn(
              "flex items-start gap-3 rounded-md px-2 py-2",
              f.highlight && "bg-background",
            )}
          >
            <Check
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                f.highlight ? "text-foreground" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">{f.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground leading-tight">
                {f.subtitle}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <a
        href={pricingHref}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Learn more about pricing
      </a>
    </div>
  );
}
