import type { MetadataRoute } from "next";

import { absoluteUrl } from "@repo/core/site-config";
import { getSitemapPaths } from "../lib/site-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return getSitemapPaths().map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === "/" || path === "/docs" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
