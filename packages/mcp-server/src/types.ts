import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Function that verifies the caller has admin privileges.
 * Should throw an Error if the caller is not authenticated or not an admin.
 */
export type RequireAdmin = () => Promise<void>;

/**
 * Configuration for registering ChatGPT widget tools.
 */
export interface WidgetConfig {
  /** Public origin used for widget metadata, CSP, and resource URIs. */
  baseURL: string;
  /**
   * Trusted application origin used to load the initial HTML snapshot. This
   * is separate from `baseURL` because a request Host header can be a valid
   * tenant alias without being a safe server-side fetch target.
   */
  contentURL?: string;
}

/**
 * Metadata for a ChatGPT Apps SDK content widget.
 */
export type ContentWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  description: string;
  widgetDomain: string;
};

export type { McpServer };
