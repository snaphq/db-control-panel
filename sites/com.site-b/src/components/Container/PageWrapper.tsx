import { ModeToggle } from "@repo/react-ui/components/ModeToggle";
import { Button } from "@repo/react-ui/components/ui/button";
import Link from "next/link";
import type React from "react";
import { siteConfig } from "../../site.config";

const NAV_LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
];

/** Site B chrome around public pages (required by @repo/site-kit routes). */
export default function PageWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
        <Link href="/" className="font-semibold text-primary">
          {siteConfig.name}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Button asChild size="sm">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
          <ModeToggle />
        </nav>
      </header>
      <main className="flex w-full flex-1 flex-col items-center">
        {children}
      </main>
      <footer className="w-full border-t px-6 py-6 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} {siteConfig.name}
          </span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
