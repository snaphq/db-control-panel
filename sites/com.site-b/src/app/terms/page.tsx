import PageWrapper from "@/components/Container/PageWrapper";
import type { Metadata } from "next";
import { siteConfig } from "../../site.config";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Page() {
  return (
    <PageWrapper>
      <article className="flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p>
          This placeholder describes the terms for using {siteConfig.name}.
          Replace it with your own terms before launch.
        </p>
      </article>
    </PageWrapper>
  );
}
