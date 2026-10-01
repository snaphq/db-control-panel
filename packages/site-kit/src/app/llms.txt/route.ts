/**
 * GET /llms.txt
 *
 * Machine-readable index of site content for AI crawlers. Follows the
 * llms.txt convention (https://llmstxt.org).
 */

export async function GET(): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";

  const lines: string[] = [
    "# Site",
    "",
    "> Auto-generated index for AI crawlers. Set NEXT_PUBLIC_APP_URL to your production URL.",
    "",
  ];

  lines.push("## Product pages", "");
  const staticPages = [
    { title: "Home", path: "/" },
    { title: "Pricing", path: "/pricing" },
    { title: "Docs", path: "/docs" },
    { title: "Changelog", path: "/changelog" },
  ];
  for (const p of staticPages) {
    lines.push(`- [${p.title}](${baseUrl}${p.path})`);
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
