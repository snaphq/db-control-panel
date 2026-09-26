import { A, useLocation } from "@solidjs/router";
import type { JSX } from "solid-js";
import { For } from "solid-js";

/**
 * Dashboard navigation.
 *
 * Desktop is a horizontal bar with a 2px bottom underline on the active item;
 * below 48rem it becomes a left sidebar with a 2px left border, mirroring the
 * two treatments in the opencode console's workspace nav. The geometry lives in
 * src/styles/nav.css so the same values drive both layouts.
 */

const ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/logs", label: "Logs" },
  { href: "/go", label: "Go" },
] as const;

export function DashboardNav(props: {
  tenantName: string;
  children?: JSX.Element;
}) {
  const location = useLocation();
  const isActive = (href: string) =>
    location.pathname === href ||
    (href === "/overview" && location.pathname === "/");

  return (
    <div data-shell="dashboard">
      <header data-shell="bar">
        <span data-slot="tenant">{props.tenantName}</span>
        <nav aria-label="Dashboard">
          <ul data-slot="items">
            <For each={ITEMS}>
              {(item) => (
                <li>
                  <A
                    href={item.href}
                    data-nav-item
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </header>
      <main data-slot="content">
        <div data-slot="inner">{props.children}</div>
      </main>
    </div>
  );
}
