import { registerMcpTool, wrapToolHandler } from "@repo/mcp-chatgpt";
import { z } from "zod";
import type { ContentWidget, McpServer, WidgetConfig } from "./types";

/** Keep widget bootstrap HTML bounded before it is copied into MCP content. */
export const MAX_WIDGET_HTML_BYTES = 1_000_000;

/** Read a text response while enforcing a byte limit for chunked bodies. */
export async function readLimitedResponseText(
  response: Response,
  maxBytes = MAX_WIDGET_HTML_BYTES,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Widget content response is too large");
  }

  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the size-limit error even if the upstream cancellation
          // races with a connection close.
        }
        throw new Error("Widget content response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchHtml(baseURL: string, path: string): Promise<string> {
  const result = await fetch(new URL(path, baseURL), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) {
    throw new Error(
      `Widget content request failed with status ${result.status}`,
    );
  }
  return readLimitedResponseText(result);
}

function widgetMeta(widget: ContentWidget, appOrigin: string) {
  return {
    ui: {
      resourceUri: widget.templateUri,
      csp: {
        connectDomains: [appOrigin],
        resourceDomains: [appOrigin],
      },
      domain: appOrigin,
    },
    securitySchemes: [{ type: "oauth2", scopes: ["api.read"] }],
    // Compatibility metadata for older ChatGPT hosts. The nested ui fields
    // above are the standards-first MCP Apps contract.
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": false,
    "openai/resultCanProduceWidget": true,
  } as const;
}

/**
 * Register ChatGPT Apps SDK widget tools on the given server instance.
 *
 * Registers a content widget resource and a tool for displaying the
 * homepage content with a user's name via the MCP Apps resource contract.
 *
 * Tool annotations are injected automatically from the central
 * MCP_TOOL_METADATA registry in @repo/mcp-chatgpt.
 */
export async function registerWidgetTools(
  server: McpServer,
  config: WidgetConfig,
): Promise<void> {
  const html = await fetchHtml(config.contentURL ?? config.baseURL, "/");
  const appOrigin = new URL(config.baseURL).origin;

  const contentWidget: ContentWidget = {
    id: "show_content",
    title: "Show Content",
    templateUri: "ui://widget/content-template.v1.html",
    invoking: "Loading content...",
    invoked: "Content loaded",
    html: html,
    description: "Displays the app homepage content",
    widgetDomain: appOrigin,
  };

  const resourceMeta = {
    ui: {
      resourceUri: contentWidget.templateUri,
      csp: {
        connectDomains: [appOrigin],
        resourceDomains: [appOrigin],
      },
      domain: appOrigin,
    },
    "openai/widgetDescription": contentWidget.description,
    "openai/widgetPrefersBorder": true,
  } as const;

  server.registerResource(
    "content-widget",
    contentWidget.templateUri,
    {
      title: contentWidget.title,
      description: contentWidget.description,
      mimeType: "text/html;profile=mcp-app",
      _meta: resourceMeta,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/html;profile=mcp-app",
          // This is intentionally a read-only component. It implements the
          // required ui/initialize handshake so hosts can render it, but it
          // does not advertise or implement ui/call-tool, ui/send-message, or
          // model-context access. The tool remains fully useful without the
          // component and `openai/widgetAccessible` stays false below.
          text: `<html><script>window.addEventListener("message",function(event){var message=event.data;if(!message||message.method!=="ui/initialize"||!event.source)return;var targetOrigin=event.origin&&event.origin!=="null"?event.origin:"*";event.source.postMessage({jsonrpc:"2.0",id:message.id,result:{protocolVersion:"2025-11-25",capabilities:{},hostInfo:{}}},targetOrigin);});</script>${contentWidget.html}</html>`,
          _meta: {
            ...resourceMeta,
            "openai/widgetDomain": contentWidget.widgetDomain,
          },
        },
      ],
    }),
  );

  registerMcpTool(
    server,
    "show_content",
    {
      description:
        "Fetch and display the homepage content with the name of the user",
      inputSchema: {
        name: z
          .string()
          .describe("The name of the user to display on the homepage"),
      },
      outputSchema: {
        name: z.string(),
        timestamp: z.string(),
      },
      _meta: widgetMeta(contentWidget, appOrigin),
    },
    wrapToolHandler("show_content", async ({ name }: { name: string }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: name,
          },
        ],
        structuredContent: {
          name: name,
          timestamp: new Date().toISOString(),
        },
        _meta: widgetMeta(contentWidget, appOrigin),
      };
    }),
  );
}
