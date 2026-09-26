import { PostHogProvider } from "@repo/analytics";
import { Analytics } from "@repo/analytics/vercel";
import { absoluteUrl, getSiteUrl } from "@repo/core/site-config";
import { NextChatSDKBootstrap } from "@repo/ui/components/NextChatSDKBootstrap";
import { WebMcpBootstrap } from "@repo/ui/components/WebMcpBootstrap";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { Toaster } from "@repo/ui/components/ui/sonner";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Provider from "./app/provider";
import type { SiteConfig } from "./site-config";

/** Default root metadata for a site; spread and override in the site layout. */
export function siteMetadata(config: SiteConfig): Metadata {
  return {
    title: config.name,
    description: config.description,
    metadataBase: new URL(absoluteUrl("/")),
    alternates: { canonical: "/" },
  };
}

/**
 * Shared <html>/<body> shell with every provider a site needs. Each site's
 * `src/app/layout.tsx` renders this and imports its own globals.css.
 */
export function SiteRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <NextChatSDKBootstrap baseUrl={getSiteUrl()} />
        <WebMcpBootstrap />
      </head>
      <body className={GeistSans.className} suppressHydrationWarning>
        <PostHogProvider>
          <Provider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </Provider>
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
