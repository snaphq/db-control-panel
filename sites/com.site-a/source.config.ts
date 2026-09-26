import {
  defineCollections,
  defineConfig,
  defineDocs,
} from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  // Public docs are the canonical source for the generated in-app /docs view.
  // Keep this as a mirror rather than maintaining a second docs tree.
  dir: "../../docs-public",
});

export const blogCollection = defineCollections({
  type: "doc",
  dir: "./content/blog",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    author: z.string().optional(),
    image: z.string().optional(),
    excerpt: z.string().optional(),
  }),
});

export default defineConfig();
