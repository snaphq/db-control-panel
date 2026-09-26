import { requestOriginForRequest } from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";
import { getAgentDocumentationIndex } from "../../../../lib/agent-discovery";

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
