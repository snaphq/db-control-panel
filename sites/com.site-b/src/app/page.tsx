import PageWrapper from "@/components/Container/PageWrapper";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { siteConfig } from "../site.config";

const FEATURES = [
  {
    title: "Workspaces",
    body: "Invite your team, manage projects, and keep billing per workspace.",
  },
  {
    title: "Integrations",
    body: "Connect MCP servers and third-party tools from the marketplace.",
  },
  {
    title: "Agent ready",
    body: "An MCP endpoint and OAuth let AI agents work on your behalf.",
  },
];

export default function Home() {
  return (
    <PageWrapper>
      <section className="flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="text-lg text-muted-foreground">
          {siteConfig.description}
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/auth/sign-up">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>
      <section className="grid w-full max-w-5xl gap-6 px-6 pb-24 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-lg border p-6">
            <h2 className="mb-2 font-medium text-primary">{feature.title}</h2>
            <p className="text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>
    </PageWrapper>
  );
}
