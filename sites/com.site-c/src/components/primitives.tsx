import { For, type JSX, Show } from "solid-js";

/**
 * The small set of primitives the three dashboard pages actually use.
 *
 * Deliberately not a port of @repo/ui: that package is React (Radix, lucide-react,
 * @tanstack/react-query) and Solid cannot render it. Building only what is used
 * keeps the surface honest — anything added here should have a caller.
 */

export function PageHeader(props: { title: string; description?: string }) {
  return (
    <header data-part="page-header">
      <h1>{props.title}</h1>
      <Show when={props.description}>
        <p>{props.description}</p>
      </Show>
    </header>
  );
}

export function Section(props: { title?: string; children?: JSX.Element }) {
  return (
    <section data-part="section">
      <Show when={props.title}>
        <h2>{props.title}</h2>
      </Show>
      {props.children}
    </section>
  );
}

export function StatTile(props: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div data-part="stat">
      <span data-slot="label">{props.label}</span>
      <span data-slot="value">{props.value}</span>
      <Show when={props.hint}>
        <span data-slot="hint">{props.hint}</span>
      </Show>
    </div>
  );
}

/** Renders a resource's error, so a page never renders a blank shell on error. */
export function ResourceError(props: { error: unknown }) {
  return (
    <p data-part="error">
      Could not load this view.{" "}
      {props.error instanceof Error ? props.error.message : "Unknown error"}.
    </p>
  );
}

export function DataTable(props: {
  columns: readonly string[];
  rows: readonly (readonly (string | Date)[])[];
  empty: string;
}) {
  return (
    <Show
      when={props.rows.length > 0}
      fallback={<p data-part="empty">{props.empty}</p>}
    >
      <div data-part="table-scroll">
        <table data-part="table">
          <thead>
            <tr>
              <For each={props.columns}>
                {(column) => <th scope="col">{column}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <For each={row}>
                    {(cell, index) => (
                      <td data-cell={props.columns[index()]}>{String(cell)}</td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
