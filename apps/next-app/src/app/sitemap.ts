import type { MetadataRoute } from "next";

import { getSitemapPaths } from "@/lib/site-content";
import { absoluteUrl } from "@repo/core/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return getSitemapPaths().map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency:
      path === "/" || path === "/blog" || path === "/docs" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
