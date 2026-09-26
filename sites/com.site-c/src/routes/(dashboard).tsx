import type { RouteSectionProps } from "@solidjs/router";
import { Show } from "solid-js";
import { DashboardNav } from "~/components/DashboardNav";
import { ResourceError } from "~/components/primitives";
import { useTenant } from "~/lib/api";

/**
 * Pathless layout for the dashboard. SolidStart nests `(dashboard)/…` under this
 * file without adding a segment to the URL, so the three pages share the shell
 * while keeping flat paths: /overview, /logs, /go.
 */
export default function DashboardLayout(props: RouteSectionProps) {
  const [tenant] = useTenant();

  return (
    <Show
      when={tenant()}
      fallback={
        <Show when={tenant.error} fallback={<p>Loading…</p>}>
          {(error) => <ResourceError error={error()} />}
        </Show>
      }
    >
      {(info) => (
        <DashboardNav tenantName={info().name}>{props.children}</DashboardNav>
      )}
    </Show>
  );
}
