import type { Database, Endpoint } from "@repo/control-plane-contract";

/** The first DNS label gets `-pooler` appended: `ep-a-1.pg…` -> `ep-a-1-pooler.pg…`. */
export function pooledHost(host: string): string {
  const [first = host, ...rest] = host.split(".");
  return [`${first}-pooler`, ...rest].join(".");
}

export interface ConnectionStrings {
  direct: string;
  pooled: string;
  sqlOverHttp: string;
  /** The control plane's `data_api_url`: null unless the Data API is enabled. */
  dataApi: string | null;
}

const PASSWORD_PLACEHOLDER = "<password>";

/** Hosts follow the control plane's `ep-<id>.<suffix>` scheme. */
export function connectionStrings(
  endpoint: Pick<Endpoint, "host">,
  role: string,
  database: Pick<Database, "name" | "data_api_url">,
  password: string = PASSWORD_PLACEHOLDER,
): ConnectionStrings {
  const credentials = `${encodeURIComponent(role)}:${password}`;
  const path = `/${encodeURIComponent(database.name)}?sslmode=require`;
  return {
    direct: `postgresql://${credentials}@${endpoint.host}${path}`,
    pooled: `postgresql://${credentials}@${pooledHost(endpoint.host)}${path}`,
    sqlOverHttp: `https://${endpoint.host}/sql`,
    dataApi: database.data_api_url,
  };
}
