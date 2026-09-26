/**
 * GET /robots.txt — explicit Allow rules for AI crawlers (GEO/AIEO).
 */

export async function GET(): Promise<Response> {
  const baseUrl =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://nextjs-starter-kit-app.vercel.app";

  const body = `# AI crawlers — explicitly allowed for GEO/AIEO indexing
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: *
Allow: /
Disallow: /adminx
Disallow: /dashboard
Disallow: /api
Disallow: /auth

Host: ${baseUrl}
Sitemap: ${baseUrl}/sitemap.xml
Content-Signal: ai-train=no, search=yes, ai-input=no
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
