import { A } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
import {
  DataTable,
  PageHeader,
  ResourceError,
  Section,
  StatTile,
} from "~/components/primitives";
import { overviewData } from "~/server/dashboard";

export default function OverviewPage() {
  const [overview] = createResource(overviewData);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Activity and plan mix for this tenant."
      />

      <Show when={overview.error}>
        {(error) => <ResourceError error={error()} />}
      </Show>

      <Show when={overview()}>
        {(data) => (
          <>
            <div data-part="stats">
              <StatTile label="Organizations" value={data().organizations} />
              <StatTile label="Audit events" value={data().auditEvents} />
              <StatTile label="Plans in use" value={data().plans.length} />
            </div>

            <Section title="Plan mix">
              <DataTable
                columns={["Tier", "Status", "Organizations"]}
                rows={data().plans.map((plan) => [
                  plan.tier,
                  plan.status,
                  String(plan.organizations),
                ])}
                empty="No organizations have a billing record yet."
              />
            </Section>

            <Section title="Next">
              <ul data-part="links">
                <li>
                  <A href="/logs">Browse the audit log</A>
                </li>
                <li>
                  <A href="/go">Review plan state</A>
                </li>
              </ul>
            </Section>
          </>
        )}
      </Show>
    </>
  );
}
