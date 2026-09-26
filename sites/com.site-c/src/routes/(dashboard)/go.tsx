import { For, Show, createResource } from "solid-js";
import {
  DataTable,
  PageHeader,
  ResourceError,
  Section,
} from "~/components/primitives";
import { goData } from "~/server/dashboard";

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export default function GoPage() {
  const [go] = createResource(goData);

  return (
    <>
      <PageHeader
        title="Go"
        description="Plan state for every organization in this tenant."
      />

      <Show when={go.error}>
        {(error) => <ResourceError error={error()} />}
      </Show>

      <Show when={go()}>
        {(data) => (
          <>
            <Section title="Organizations">
              <DataTable
                columns={[
                  "Organization",
                  "Status",
                  "Plan",
                  "Plan status",
                  "Renews",
                  "Ends",
                ]}
                rows={data().organizations.map((org) => [
                  org.organization,
                  org.status,
                  org.planTier ?? "no plan",
                  org.planStatus ?? "—",
                  formatDate(org.currentPeriodEnd),
                  org.cancelAtPeriodEnd
                    ? formatDate(org.currentPeriodEnd)
                    : "—",
                ])}
                empty="This tenant has no organizations yet."
              />
            </Section>

            <Section title="Plan detail">
              <For
                each={data().tiers}
                fallback={
                  <p data-part="empty">
                    No plan tiers are in use in this tenant.
                  </p>
                }
              >
                {(tier) => (
                  <article data-part="tier">
                    <h3>
                      {tier.displayName} <code>{tier.key}</code>
                    </h3>
                    <Show when={tier.description}>
                      <p>{tier.description}</p>
                    </Show>
                    <Show
                      when={tier.features.length > 0}
                      fallback={<p data-part="empty">No features listed.</p>}
                    >
                      <ul>
                        <For each={tier.features}>
                          {(feature) => <li>{feature}</li>}
                        </For>
                      </ul>
                    </Show>
                  </article>
                )}
              </For>
            </Section>
          </>
        )}
      </Show>
    </>
  );
}
