import { absoluteUrl } from "@repo/core/site-config";
import { defaultMdxComponents } from "@repo/fumadocs/components";
import { blog } from "@site/lib/source";
import Image from "next/image";
import { notFound } from "next/navigation";

export default async function BlogPostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const post = blog.find(
    (p) => p.info.path.replace(/\.mdx$/, "") === params.slug,
  );

  if (!post) {
    notFound();
  }

  const MDX = post.body;

  return (
    <article className="container mx-auto px-4 py-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="scroll-m-20 text-4xl font-bold tracking-tight mb-4">
          {post.title}
        </h1>
        <div className="flex items-center gap-4 text-muted-foreground mb-6">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {post.author && (
            <>
              <span>&bull;</span>
              <span>{post.author}</span>
            </>
          )}
        </div>
        {post.image && (
          <Image
            src={post.image}
            alt={post.title}
            width={1200}
            height={675}
            className="rounded-lg mb-8 w-full h-auto"
            priority
          />
        )}
      </header>
      <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold">
        <MDX components={{ ...defaultMdxComponents }} />
      </div>
    </article>
  );
}

export function generateStaticParams() {
  return blog.map((post) => ({
    slug: post.info.path.replace(/\.mdx$/, ""),
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const post = blog.find(
    (p) => p.info.path.replace(/\.mdx$/, "") === params.slug,
  );
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: absoluteUrl(`/blog/${params.slug}`),
    },
  };
}
