import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@/lib/agent-auth/cors";
import { requestOriginForRequest } from "@/lib/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";

export async function GET(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant)
    return withPublicDiscoveryCors(
      new Response("Unknown tenant host", { status: 404 }),
    );
  const origin = requestOriginForRequest(request);
  const url = (pathname: string) => new URL(pathname, origin).toString();
  const body = {
    linkset: [
      {
        anchor: url("/mcp"),
        "service-doc": [{ href: url("/docs") }],
        status: [{ href: url("/status") }],
      },
      {
        anchor: url("/api/auth/.well-known/openid-configuration"),
        "service-doc": [{ href: url("/docs") }],
        status: [{ href: url("/status") }],
      },
    ],
  };

  return withPublicDiscoveryCors(
    new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/linkset+json; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    }),
  );
}

export function OPTIONS(): Response {
  return publicDiscoveryOptions();
}
