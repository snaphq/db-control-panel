export async function GET(_request: Request): Promise<Response> {
  return new Response(
    "This endpoint is deprecated. Use /.well-known/agent-docs/index.json instead.",
    {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
