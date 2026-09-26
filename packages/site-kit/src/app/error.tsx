"use client";

import { ErrorScreen } from "@repo/react-ui/components/errors/error-screen";
import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      code="500"
      title="An unexpected error occurred."
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-muted"
        >
          Try again
        </button>
      }
    />
  );
}
