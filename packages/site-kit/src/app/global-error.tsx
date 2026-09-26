"use client";

import { GeistSans } from "geist/font/sans";
import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className={GeistSans.className}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            background: "#fff",
            color: "#000",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              500
            </h1>
            <div
              aria-hidden="true"
              style={{
                width: "1px",
                height: "48px",
                background: "rgba(0,0,0,0.12)",
              }}
            />
            <p
              style={{
                fontSize: "14px",
                color: "rgba(0,0,0,0.6)",
                margin: 0,
              }}
            >
              An unexpected error occurred.
            </p>
          </div>
          <div
            style={{
              marginTop: "40px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
            }}
          >
            <a
              href="/"
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#000",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Go home
            </a>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                color: "#000",
                fontWeight: 500,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
