/**
 * Site-owned constants for the public pages. Site identity itself lives in
 * src/site.config.ts (read by the seeder); these are presentation-only.
 */

export const siteName = "Site D";

export const siteTagline =
  "A standalone Astro tenant site on the shared platform.";

export const navLinks = [
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
] as const;
