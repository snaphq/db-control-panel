import { docsSource } from "@/lib/source";
import { absoluteUrl } from "@repo/core/site-config";
import type { TOCItemType } from "@repo/fumadocs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  defaultMdxComponents,
} from "@repo/fumadocs/components";
import type { MDXContent } from "mdx/types";
import { notFound } from "next/navigation";

type DocsPageData = {
  body: MDXContent;
  description?: string;
  title?: string;
  toc: TOCItemType[];
};

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = docsSource.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as DocsPageData;
  const MDX = data.body;

  return (
    <DocsPage toc={data.toc}>
      <DocsTitle>{data.title}</DocsTitle>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{ ...defaultMdxComponents }} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = docsSource.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as DocsPageData;

  return {
    title: data.title,
    description: data.description,
    alternates: {
      canonical: absoluteUrl(`/docs/${params.slug?.join("/") ?? ""}`),
    },
  };
}
