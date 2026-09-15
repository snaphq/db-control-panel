import {
  assertSafeMcpEndpoint,
  createSafeMcpDispatcher,
  readLimitedResponseText,
  safeMcpHeaders,
  setManagedMcpHeader,
} from "./mcp-proxy";
import { type CustomMCPServerConfig, normalizeMcpHeaders } from "./types";

export type SplitConfigResult = {
  /** Sensitive fields → encrypted blob */
  secret: Record<string, unknown> | null;
  /** Non-sensitive fields → stored in plain configPublic JSONB */
  publicConfig: Record<string, unknown>;
};

export type VerifyResult = { ok: true } | { ok: false; error: string };

export type ProviderHandler = {
  /**
   * Validate raw config from form. Throws on invalid input.
   */
  validate: (config: Record<string, unknown>) => void;
  /**
   * Split a validated config into secret + public parts.
   */
  splitConfig: (config: Record<string, unknown>) => SplitConfigResult;
  /**
   * Verify the integration is reachable / credentials are valid.
   * Receives merged (secret + public) config.
   */
  verify: (config: Record<string, unknown>) => Promise<VerifyResult>;
};

// ---------------------------------------------------------------------------
// custom-mcp-server
// ---------------------------------------------------------------------------

const customMcpServer: ProviderHandler = {
  validate(config) {
    const { endpointUrl, authType, credentials, headers, toolAllowlist } =
      config as CustomMCPServerConfig;
    if (typeof endpointUrl !== "string" || endpointUrl.length === 0) {
      throw new Error("endpointUrl is required.");
    }
    let parsed: URL;
    try {
      parsed = new URL(endpointUrl);
    } catch {
      throw new Error("endpointUrl must be a valid URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("endpointUrl must use http or https.");
    }
    if (parsed.username || parsed.password || parsed.hash) {
      throw new Error("endpointUrl cannot contain credentials or fragments.");
    }
    if (parsed.search) {
      throw new Error(
        "endpointUrl cannot contain query parameters; configure credentials as headers.",
      );
    }
    const allowed = ["none", "bearer", "apiKey", "basic"];
    if (typeof authType !== "string" || !allowed.includes(authType)) {
      throw new Error(`authType must be one of: ${allowed.join(", ")}.`);
    }
    if (credentials !== undefined) {
      if (
        typeof credentials !== "string" ||
        credentials.length === 0 ||
        credentials.length > 8192 ||
        /[\r\n]/.test(credentials)
      ) {
        throw new Error(
          "credentials must be a non-empty string of at most 8192 characters without CR or LF.",
        );
      }
    }
    if (authType !== "none" && !credentials) {
      throw new Error("credentials are required for the chosen authType.");
    }
    normalizeMcpHeaders(headers);
    if (toolAllowlist !== undefined) {
      if (
        !Array.isArray(toolAllowlist) ||
        toolAllowlist.length > 500 ||
        toolAllowlist.some(
          (toolName) =>
            typeof toolName !== "string" ||
            toolName.length === 0 ||
            toolName.length > 256 ||
            /[\r\n]/.test(toolName),
        )
      ) {
        throw new Error(
          "toolAllowlist must contain at most 500 non-empty tool names.",
        );
      }
    }
  },
  splitConfig(config) {
    const { credentials, headers, ...rest } = config as CustomMCPServerConfig;
    const normalizedHeaders = normalizeMcpHeaders(headers);
    const secret = {
      ...(credentials ? { credentials } : {}),
      ...(Object.keys(normalizedHeaders).length > 0
        ? { headers: normalizedHeaders }
        : {}),
    };
    return {
      secret: Object.keys(secret).length > 0 ? secret : null,
      publicConfig: rest as Record<string, unknown>,
    };
  },
  async verify(config) {
    const { endpointUrl, authType, credentials, headers } =
      config as CustomMCPServerConfig;
    const reqHeaders: Record<string, string> = safeMcpHeaders(
      normalizeMcpHeaders(headers),
    );

    if (authType === "bearer" && credentials) {
      setManagedMcpHeader(reqHeaders, "Authorization", `Bearer ${credentials}`);
    } else if (authType === "apiKey" && credentials) {
      setManagedMcpHeader(reqHeaders, "X-API-Key", credentials);
    } else if (authType === "basic" && credentials) {
      setManagedMcpHeader(
        reqHeaders,
        "Authorization",
        `Basic ${Buffer.from(credentials).toString("base64")}`,
      );
    }

    try {
      const endpoint = await assertSafeMcpEndpoint(endpointUrl);
      const dispatcher = createSafeMcpDispatcher();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers: { ...reqHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
          }),
          signal: AbortSignal.timeout(10_000),
          // Use the same socket-time DNS policy as runtime tool calls. The
          // validation lookup above must not be the only SSRF control.
          dispatcher,
        } as RequestInit & {
          dispatcher: ReturnType<typeof createSafeMcpDispatcher>;
        });
        // Consume the provider response through the MCP byte cap even for a
        // reachability check. Otherwise a chunked/error response could leave
        // an unbounded body in flight and bypass the proxy's response limit.
        try {
          await readLimitedResponseText(res, 1_000_000);
        } catch {
          return {
            ok: false,
            error: "MCP server response is too large or unreadable.",
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            error: `Server responded with ${res.status} ${res.statusText}.`,
          };
        }
        return { ok: true };
      } finally {
        await dispatcher.close();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Could not reach endpoint: ${msg}` };
    }
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const providerHandlers: Record<string, ProviderHandler> = {
  "custom-mcp-server": customMcpServer,
};

export function getProviderHandler(slug: string): ProviderHandler | null {
  return providerHandlers[slug] ?? null;
}
