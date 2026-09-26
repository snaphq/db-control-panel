import { Badge } from "../../ui/badge";

export function OperatorStatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return <Badge variant="outline">Active</Badge>;
  }
  if (status === "suspended") {
    return <Badge variant="secondary">Suspended</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}
