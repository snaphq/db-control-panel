import { SiteRootLayout, siteMetadata } from "@repo/site-kit/root-layout";
import type { Metadata } from "next";
import { siteConfig } from "../site.config";
import "./globals.css";

export const metadata: Metadata = siteMetadata(siteConfig);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteRootLayout>{children}</SiteRootLayout>;
}
