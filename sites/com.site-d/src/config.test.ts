import { describe, expect, it } from "vitest";
import { navLinks, siteName } from "./config";
import { siteConfig } from "./site.config";

describe("site config", () => {
  it("keeps the standalone identity fields the seeder reads", () => {
    expect(siteConfig.stack).toBe("standalone");
    expect(siteConfig.id).toBe("com.site-d");
    expect(siteConfig.tenantId).toBe("site-d");
    expect(siteConfig.tenantSlug).toBe("site-d");
    expect(siteConfig.domain).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
  });

  it("never claims another site's tenant", () => {
    expect(siteConfig.tenantId).not.toBe("default");
    expect(siteConfig.tenantId).not.toBe("site-c");
  });

  it("keeps navigation inside the site", () => {
    expect(siteName.length).toBeGreaterThan(0);
    for (const link of navLinks) {
      expect(link.href.startsWith("/")).toBe(true);
    }
  });
});
