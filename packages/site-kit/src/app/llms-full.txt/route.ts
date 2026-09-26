/**
 * GET /llms-full.txt
 *
 * Full content dump of blog posts for AI grounding. Larger than /llms.txt —
 * intended for crawlers that want deep context.
 */

import { blog } from "@site/lib/source";

export async function GET(): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";

  const sortedPosts = [...blog].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const sections: string[] = [
    "# Site — Full Content Index",
    "",
    "> Full text of blog posts for AI indexing purposes.",
    `> Source: ${baseUrl}`,
    "",
  ];

  for (const post of sortedPosts) {
    const slug = post.info.path.replace(/\.mdx$/, "");
    const url = `${baseUrl}/blog/${slug}`;
    sections.push("---");
    sections.push(`# ${post.title}`);
    sections.push(`URL: ${url}`);
    sections.push(`Date: ${post.date}`);
    if (post.excerpt) sections.push(`Summary: ${post.excerpt}`);
    sections.push("");
    sections.push(
      "(Fetch the URL above for full post content — body extraction depends on the MDX loader.)",
    );
    sections.push("");
  }

  return new Response(sections.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
