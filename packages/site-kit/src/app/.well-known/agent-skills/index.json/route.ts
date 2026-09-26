export async function GET(): Promise<Response> {
  return Response.json(
    {
      error: "deprecated",
      message:
        "This application documentation endpoint is not an MCP skills catalog.",
      replacement: "/.well-known/agent-docs/index.json",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "public, max-age=3600",
        Link: '</.well-known/agent-docs/index.json>; rel="successor-version"',
      },
    },
  );
}
