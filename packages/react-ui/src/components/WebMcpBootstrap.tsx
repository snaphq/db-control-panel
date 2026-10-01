"use client";

import Script from "next/script";

export function WebMcpBootstrap() {
  return (
    <Script id="webmcp-bootstrap" strategy="afterInteractive">
      {`
        (function () {
          const modelContext = navigator.modelContext;
          if (!modelContext || typeof modelContext.provideContext !== 'function') {
            return;
          }

          modelContext.provideContext({
            tools: [
              {
                name: 'search_docs',
                description: 'Navigate to the public documentation for this site.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'Optional docs path to open, such as /docs/start/getting-started.'
                    }
                  }
                },
                execute: async (input) => {
                  const path = typeof input?.path === 'string' && input.path.startsWith('/docs')
                    ? input.path
                    : '/docs';
                  return { url: path };
                }
              }
            ]
          });
        })();
      `}
    </Script>
  );
}
