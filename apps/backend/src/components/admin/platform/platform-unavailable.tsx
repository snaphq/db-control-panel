import type { Loaded } from "@/lib/platform/load";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/react-ui/components/ui/alert";
import { CloudOff } from "lucide-react";

type Unavailable = Extract<Loaded<unknown>, { status: "unavailable" }>;

const TITLES: Record<Unavailable["reason"], string> = {
  not_configured: "Platform view is not connected",
  unreachable: "Control plane is not reachable",
  rejected: "Control plane rejected the admin token",
  not_found: "Not found",
  error: "Control plane returned an error",
};

/** Shown instead of a page's content when the control plane cannot be read. */
export function PlatformUnavailable({ result }: { result: Unavailable }) {
  return (
    <Alert>
      <CloudOff className="h-4 w-4" />
      <AlertTitle>{TITLES[result.reason]}</AlertTitle>
      <AlertDescription>
        <p>{result.message}</p>
        {result.reason === "not_configured" ||
        result.reason === "unreachable" ? (
          <p className="mt-2 text-muted-foreground">
            This portal reads the cluster through the control plane at{" "}
            <code>ALLOYDB_API_URL</code> with{" "}
            <code>ALLOYDB_ADMIN_API_TOKEN</code>. Nothing is wrong with the
            portal itself; the pages fill in once the control plane is running.
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
