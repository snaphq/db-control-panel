import { DocsLayout, RootProvider } from "@repo/fumadocs/components";
import { docsSource } from "@site/lib/source";
import "fumadocs-ui/style.css";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout tree={docsSource.getPageTree()} nav={{ title: "Docs" }}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
