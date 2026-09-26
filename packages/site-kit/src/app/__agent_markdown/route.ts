import { getMarkdownContent } from "../../lib/agent-discovery";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("pathname") ?? "/";
  const content = getMarkdownContent(pathname);

  if (!content) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      "X-Markdown-Tokens": String(content.split(/\s+/).filter(Boolean).length),
    },
  });
}
