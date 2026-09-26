import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { siteConfig } from "./src/site.config";

const withMDX = createMDX({
  outDir: "src/.source",
});

const config: NextConfig = {
  // Pins the tenant that local (localhost) requests resolve to; production
  // requests resolve their tenant from the Host header.
  env: { SITE_TENANT_ID: siteConfig.tenantId },
  // @aws-lite/client uses dynamic import(path) at runtime which Turbopack cannot statically analyze
  serverExternalPackages: ["@aws-lite/client", "@aws-lite/s3"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "seo-heist.s3.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "github.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ansubkhan.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default withMDX(config);
