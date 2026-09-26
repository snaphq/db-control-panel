#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

type CoverageEntry = {
  id: string;
  page: string;
  sources: string[];
  visibility: "internal" | "public" | "source-only";
  site?: "docs-internal" | "docs-public";
};

type CoverageFile = {
  schemaVersion: number;
  entries: CoverageEntry[];
};

function readJson<T>(relativePath: string): T {
  const absolutePath = resolve(root, relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

function pageExists(site: string, page: string): boolean {
  return [".mdx", ".md", ".json"].some((extension) =>
    existsSync(resolve(root, site, `${page}${extension}`)),
  );
}

function navigationPages(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(navigationPages);

  const record = value as Record<string, unknown>;
  const pages = typeof record.pages === "object" ? record.pages : undefined;
  return [
    ...(Array.isArray(pages)
      ? pages.filter((page): page is string => typeof page === "string")
      : []),
    ...Object.values(record).flatMap(navigationPages),
  ];
}

/** "com.site-a" -> "site-a": the docs folder for a site workspace. */
function siteDocsFolder(siteWorkspace: string): string {
  return siteWorkspace.split(".").slice(1).join(".") || siteWorkspace;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const coverage = readJson<CoverageFile>("docs-internal/coverage.json");
assert(coverage.schemaVersion === 1, "Unsupported coverage manifest version");
assert(Array.isArray(coverage.entries), "Coverage entries must be an array");

const ids = new Set<string>();
const pages = new Set<string>();
for (const entry of coverage.entries) {
  assert(
    typeof entry.id === "string" && entry.id.length > 0,
    "Coverage entry is missing an id",
  );
  assert(!ids.has(entry.id), `Duplicate coverage id: ${entry.id}`);
  ids.add(entry.id);

  assert(
    typeof entry.page === "string" && entry.page.length > 0,
    `Coverage entry ${entry.id} is missing a page`,
  );
  const site =
    entry.site ??
    (entry.visibility === "public" ? "docs-public" : "docs-internal");
  assert(
    site === "docs-internal" || site === "docs-public",
    `Coverage entry ${entry.id} has an invalid site: ${String(entry.site)}`,
  );
  assert(
    entry.visibility === "internal" ||
      entry.visibility === "public" ||
      entry.visibility === "source-only",
    `Coverage entry ${entry.id} has an invalid visibility: ${String(entry.visibility)}`,
  );
  assert(
    site !== "docs-public" || entry.visibility === "public",
    `Public site entry ${entry.id} must have public visibility`,
  );
  const pageKey = `${site}:${entry.page}`;
  assert(!pages.has(pageKey), `Duplicate coverage page: ${pageKey}`);
  pages.add(pageKey);
  assert(
    pageExists(site, entry.page.replace(/\.(md|mdx)$/, "")),
    `Coverage page does not exist: ${site}/${entry.page}`,
  );

  assert(
    Array.isArray(entry.sources) && entry.sources.length > 0,
    `Coverage entry ${entry.id} must name at least one source root`,
  );
  for (const source of entry.sources) {
    assert(
      existsSync(resolve(root, source)),
      `Coverage source does not exist: ${source} (${entry.id})`,
    );
  }

  // Site-specific docs live in docs-*/<site>/: a page that documents only one
  // site's code (sources all under sites/com.<site>/) must sit in that folder.
  const siteFolders = new Set(
    entry.sources.map((source) => source.match(/^sites\/([^/]+)/)?.[1] ?? ""),
  );
  const [onlySite] = [...siteFolders];
  if (siteFolders.size === 1 && onlySite) {
    const docsFolder = siteDocsFolder(onlySite);
    assert(
      entry.page.startsWith(`${docsFolder}/`),
      `Coverage entry ${entry.id} documents only sites/${onlySite}; move ${site}/${entry.page} under ${site}/${docsFolder}/`,
    );
  }
}

for (const site of ["docs-public", "docs-internal"]) {
  const config = readJson<Record<string, unknown>>(`${site}/docs.json`);
  for (const page of navigationPages(config)) {
    assert(
      pageExists(site, page),
      `${site} navigation page does not exist: ${page}`,
    );
  }
}

console.log(
  `Documentation coverage OK: ${coverage.entries.length} entries across both sites and navigation files are source-present.`,
);
