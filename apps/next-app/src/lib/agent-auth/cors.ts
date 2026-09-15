/**
 * CORS policy for public discovery documents.
 *
 * These responses contain no credentials and are intentionally readable by
 * browser-based MCP/OAuth clients from any origin. Keep the policy in one
 * place so every discovery route handles successful, error, and preflight
 * responses consistently.
 */
export const PUBLIC_DISCOVERY_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function withPublicDiscoveryCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PUBLIC_DISCOVERY_CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function publicDiscoveryOptions(): Response {
  return withPublicDiscoveryCors(new Response(null, { status: 204 }));
}
