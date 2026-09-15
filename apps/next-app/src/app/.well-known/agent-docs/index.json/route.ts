import { requestOriginForRequest } from "@/lib/agent-auth/discovery";
import { getAgentDocumentationIndex } from "@/lib/agent-discovery";
import { resolveTenantFromHost } from "@repo/database";

export async function GET(request: Request): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return new Response("Unknown tenant host", { status: 404 });
  return Response.json(
    getAgentDocumentationIndex(requestOriginForRequest(request)),
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    },
  );
}
