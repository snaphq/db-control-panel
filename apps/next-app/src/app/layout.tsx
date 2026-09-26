import { baseURL } from "@/../baseUrl";
import { PostHogProvider } from "@repo/analytics";
import { Analytics } from "@repo/analytics/vercel";
import { absoluteUrl } from "@repo/core/site-config";
import Provider from "@repo/site-kit/app/provider";
import { NextChatSDKBootstrap } from "@repo/ui/components/NextChatSDKBootstrap";
import { WebMcpBootstrap } from "@repo/ui/components/WebMcpBootstrap";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { Toaster } from "@repo/ui/components/ui/sonner";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nextjs 16 Starter Template",
  description: "Build your next SAAS product",
  metadataBase: new URL(absoluteUrl("/")),
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <NextChatSDKBootstrap baseUrl={baseURL} />
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
