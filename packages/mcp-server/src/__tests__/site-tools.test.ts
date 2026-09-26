import { runWithMcpContext } from "@repo/mcp-chatgpt";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "../types";

vi.mock("../widget-tools", () => ({
  registerWidgetTools: vi.fn(async (server: McpServer) => {
    // Stand-in for the real widget tool; mutating, so readOnly must drop it.
    server.registerTool(
      "show_content",
      { annotations: { readOnlyHint: false } },
      async () => ({ content: [] }),
    );
  }),
}));

const { registerSiteTools } = await import("../site-tools");

type Registered = { name: string; handler: (args: unknown) => unknown };

function fakeServer() {
  const tools: Registered[] = [];
  const server = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (args: unknown) => unknown,
    ) => {
      tools.push({ name, handler });
    },
    registerResource: () => undefined,
  } as unknown as McpServer;
  return { server, tools };
}

const widget = { baseURL: "https://site.example" };

describe("registerSiteTools", () => {
  it("registers only the toolsets the site enables", async () => {
    const { server, tools } = fakeServer();
    await registerSiteTools(server, {
      siteName: "Site B",
      toolsets: ["account"],
      widget,
    });
    expect(tools.map((tool) => tool.name)).toEqual(["whoami"]);
  });

  it("registers every enabled toolset once", async () => {
    const { server, tools } = fakeServer();
    await registerSiteTools(server, {
      siteName: "Site A",
      toolsets: ["content", "account", "account"],
      widget,
    });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "show_content",
      "whoami",
    ]);
  });

  it("drops tools that are not annotated read-only in read-only mode", async () => {
    const { server, tools } = fakeServer();
    await registerSiteTools(server, {
      siteName: "Demo",
      toolsets: ["content", "account"],
      readOnly: true,
      widget,
    });
    expect(tools.map((tool) => tool.name)).toEqual(["whoami"]);
  });

  it("whoami reports the authenticated site and tenant context", async () => {
    const { server, tools } = fakeServer();
    await registerSiteTools(server, {
      siteName: "Site B",
      toolsets: ["account"],
      widget,
    });
    const result = (await runWithMcpContext(
      {
        requestId: "req-1",
        tenantId: "site-b",
        actorType: "operator",
        actorName: "CI bot",
        authMethod: "operator_credential",
        scopes: ["mcp:read"],
      },
      async () => tools[0].handler({}),
    )) as { content: Array<{ text: string }> };

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      site: "Site B",
      tenantId: "site-b",
      actorType: "operator",
      actorName: "CI bot",
      authMethod: "operator_credential",
      scopes: ["mcp:read"],
    });
  });
});
