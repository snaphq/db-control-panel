import PageWrapper from "@/components/Container/PageWrapper";
import type { Metadata } from "next";
import { siteConfig } from "../../site.config";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <PageWrapper>
      <article className="flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p>
          This placeholder explains how {siteConfig.name} collects, uses, and
          protects your data. Replace it with your own policy before launch.
        </p>
      </article>
    </PageWrapper>
  );
}
