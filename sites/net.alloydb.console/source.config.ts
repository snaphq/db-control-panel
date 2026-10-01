import { readdirSync } from "node:fs";
import {
  defineCollections,
  defineConfig,
  defineDocs,
} from "fumadocs-mdx/config";
import { z } from "zod";

const DOCS_DIR = "../../docs-public";
// Site-specific public docs live in docs-public/<site>/ (e.g. alloydb.console/). Mirror
// the shared pages plus this site's own folder, never another site's.
const OWN_DOCS_FOLDER = "alloydb.console";
const otherSiteDocs = readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      /^site-/.test(entry.name) &&
      entry.name !== OWN_DOCS_FOLDER,
  )
  .map((entry) => `!${entry.name}/**`);

export const docs = defineDocs({
  // Public docs are the canonical source for the generated in-app /docs view.
  // Keep this as a mirror rather than maintaining a second docs tree.
  dir: DOCS_DIR,
  docs: { files: ["**/*.{md,mdx}", ...otherSiteDocs] },
  meta: { files: ["**/*.{json,yaml}", ...otherSiteDocs] },
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
