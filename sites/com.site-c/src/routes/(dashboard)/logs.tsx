import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
import {
  DataTable,
  PageHeader,
  ResourceError,
  Section,
} from "~/components/primitives";
import { fetchLogs } from "~/lib/api";

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace("T", " ").slice(0, 16);
}

export default function LogsPage() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const page = () => Math.max(0, Number(search.page ?? 0) || 0);
  // No explicit generic: in the (source, fetcher) form the type parameter is
  // the source's, and LogsPage is already carried by fetchLogs' signature.
  const [logs] = createResource(page, fetchLogs);

  const goTo = (next: number) => {
    setSearch(next === 0 ? {} : { page: String(next) });
    navigate(`/logs${next === 0 ? "" : `?page=${next}`}`, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Logs"
        description="Audit events recorded for this tenant."
      />

      <Show when={logs.error}>
        {(error) => <ResourceError error={error()} />}
      </Show>

      <Show when={logs()}>
        {(data) => (
          <Section title={`Page ${data().page + 1}`}>
            <DataTable
              columns={["When", "Organization", "Action", "From", "To", "By"]}
              rows={data().entries.map((entry) => [
                formatWhen(entry.createdAt),
                entry.organization,
                entry.action,
                entry.fromValue ?? "—",
                entry.toValue ?? "—",
                entry.performedBy,
              ])}
              empty="No audit events have been recorded for this tenant yet."
            />

            <nav data-part="pager" aria-label="Log pages">
              <button
                type="button"
                disabled={page() === 0}
                onClick={() => goTo(page() - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data().hasMore}
                onClick={() => goTo(page() + 1)}
              >
                Next
              </button>
            </nav>
          </Section>
        )}
      </Show>
    </>
  );
}
