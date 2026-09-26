import { blog } from "@site/lib/source";
import Image from "next/image";
import Link from "next/link";

export default async function BlogPage() {
  const posts = blog;

  // Sort by date descending
  const sortedPosts = [...posts].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="scroll-m-20 text-4xl font-bold tracking-tight mb-2">
          Blog
        </h1>
        <p className="text-muted-foreground">
          Explore our latest articles and insights
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {sortedPosts.map((post) => {
          const slug = post.info.path.replace(/\.mdx$/, "");
          return (
            <Link
              key={slug}
              href={`/blog/${slug}`}
              className="block p-6 border rounded-lg hover:shadow-lg transition-shadow"
            >
              {post.image && (
                <Image
                  src={post.image}
                  alt={post.title}
                  width={400}
                  height={250}
                  className="rounded-md mb-4 w-full h-auto"
                />
              )}
              <h2 className="text-2xl font-semibold mb-2">{post.title}</h2>
              {post.excerpt && (
                <p className="text-muted-foreground mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
              )}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {post.author && <span>{post.author}</span>}
              </div>
            </Link>
          );
        })}
      </div>
      {sortedPosts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No blog posts found.</p>
        </div>
      )}
    </div>
  );
}
