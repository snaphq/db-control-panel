import type {
  Integration,
  IntegrationInstallation,
} from "@repo/database/schema";

export type IntegrationCategory =
  | "email"
  | "crm"
  | "analytics"
  | "tools"
  | "other";

export type IntegrationStatus = "active" | "beta" | "deprecated" | "hidden";

export type InstallationStatus = "active" | "error" | "disabled";

export type IntegrationMetadata = {
  hidden?: boolean;
  authType?: "byo" | "oauth" | "platform";
  features?: string[];
  requirements?: string[];
  pricing?: string;
  [key: string]: unknown;
};

/**
 * Public-safe view of an installation (never includes configEncrypted).
 */
export type SafeInstallation = Omit<
  IntegrationInstallation,
  "configEncrypted"
> & {
  hasSecret: boolean;
};

export type InstallationWithIntegration = SafeInstallation & {
  integration: Integration;
};

export type IntegrationWithInstallations = Integration & {
  installations: SafeInstallation[];
};

export type InstallIntegrationInput = {
  integrationSlug: string;
  organizationId: string;
  /** null/undefined for workspace-scoped install */
  projectId?: string | null;
  displayName?: string;
  config: Record<string, unknown>;
};

export type CustomMCPServerConfig = {
  endpointUrl: string;
  authType: "none" | "bearer" | "apiKey" | "basic";
  credentials?: string;
  headers?: Record<string, string>;
  toolAllowlist?: string[];
};

const HTTP_TOKEN_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Header names that commonly carry credentials or bearer material. */
export function isSensitiveMcpHeader(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "proxy-authorization" ||
    normalized === "cookie" ||
    normalized === "set-cookie" ||
    normalized === "x-api-key" ||
    normalized === "api-key" ||
    normalized.endsWith("-api-key") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password")
  );
}

/** Validate custom MCP headers before they are persisted or sent. */
export function normalizeMcpHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("headers must be an object of HTTP header values.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 50)
    throw new Error("At most 50 custom headers are allowed.");
  const result: Record<string, string> = {};
  const names = new Map<string, string>();
  for (const [name, raw] of entries) {
    if (!HTTP_TOKEN_NAME.test(name) || name.length > 128) {
      throw new Error(`Invalid MCP header name '${name}'.`);
    }
    if (typeof raw !== "string" || raw.length > 8192) {
      throw new Error(
        `MCP header '${name}' must be a string of at most 8192 characters.`,
      );
    }
    if (/[\r\n]/.test(raw)) {
      throw new Error(
        `MCP header '${name}' cannot contain CR or LF characters.`,
      );
    }
    const normalized = name.toLowerCase();
    const previous = names.get(normalized);
    if (previous) delete result[previous];
    names.set(normalized, name);
    result[name] = raw;
  }
  return result;
}

/** Remove credential-bearing headers from a legacy public configuration. */
export function publicMcpHeaders(value: unknown): Record<string, string> {
  let headers: Record<string, string>;
  try {
    headers = normalizeMcpHeaders(value);
  } catch {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !isSensitiveMcpHeader(name)),
  );
}

export function toSafeInstallation(
  row: IntegrationInstallation,
): SafeInstallation {
  const { configEncrypted, ...rest } = row;
  const configPublic =
    rest.configPublic && typeof rest.configPublic === "object"
      ? { ...(rest.configPublic as Record<string, unknown>) }
      : rest.configPublic;
  if (
    configPublic &&
    typeof configPublic === "object" &&
    "headers" in configPublic
  ) {
    try {
      const headers = normalizeMcpHeaders(configPublic.headers);
      configPublic.headers = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
          name,
          isSensitiveMcpHeader(name) ? "[redacted; rotate this header]" : value,
        ]),
      );
    } catch {
      configPublic.headers = undefined;
    }
  }
  if (configPublic && typeof configPublic === "object") {
    const publicConfig = configPublic as Record<string, unknown>;
    if (typeof publicConfig.endpointUrl === "string") {
      try {
        const endpoint = new URL(publicConfig.endpointUrl);
        if (
          endpoint.username ||
          endpoint.password ||
          endpoint.search ||
          endpoint.hash
        ) {
          // Legacy installations may have persisted credentials in the URL.
          // Keep the projection useful enough to identify the installation,
          // but never return those values to a browser or API client.
          endpoint.username = "";
          endpoint.password = "";
          endpoint.search = "";
          endpoint.hash = "";
          publicConfig.endpointUrl = endpoint.toString();
        }
      } catch {
        publicConfig.endpointUrl = "[redacted; invalid endpoint]";
      }
    }
    // Legacy rows may have stored credentials in configPublic before the
    // encrypted split was introduced. Never return those values through an
    // API/dashboard projection; callers can PATCH the installation to rotate
    // them into configEncrypted.
    for (const key of [
      "credentials",
      "password",
      "apiKey",
      "api_key",
      "accessToken",
      "refreshToken",
      "clientSecret",
    ]) {
      if (key in publicConfig) delete publicConfig[key];
    }
  }
  return { ...rest, configPublic, hasSecret: Boolean(configEncrypted) };
}
