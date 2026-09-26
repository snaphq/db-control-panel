import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@repo/core/agent-auth/cors";
import {
  MAX_WIDGET_HTML_BYTES,
  readLimitedResponseText,
} from "@repo/mcp-server/widget";
import { describe, expect, it } from "vitest";

describe("public discovery CORS", () => {
  it("adds a browser-readable policy to discovery responses", async () => {
    const response = withPublicDiscoveryCors(Response.json({ ok: true }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers preflight requests without a body", () => {
    const response = publicDiscoveryOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("widget response limits", () => {
  it("rejects a response over the byte cap", async () => {
    const body = new Uint8Array(MAX_WIDGET_HTML_BYTES + 1);
    await expect(readLimitedResponseText(new Response(body))).rejects.toThrow(
      /too large/i,
    );
  });

  it("bounds chunked responses and decodes accepted content", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<p>ok</p>"));
        controller.close();
      },
    });
    await expect(readLimitedResponseText(new Response(body))).resolves.toBe(
      "<p>ok</p>",
    );
  });
});
