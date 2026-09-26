import { requestOriginForRequest } from "@repo/core/agent-auth/discovery";
import { resolveTenantFromHost } from "@repo/database";
import {
  getAgentDocument,
  getAgentDocumentationIndex,
} from "../../../../lib/agent-discovery";

export async function GET(
  request: Request,
  context: { params: Promise<{ document: string }> },
): Promise<Response> {
  const tenant = await resolveTenantFromHost(request.headers.get("host"));
  if (!tenant) return new Response("Unknown tenant host", { status: 404 });
  const { document } = await context.params;
  const origin = requestOriginForRequest(request);
  const entry = getAgentDocumentationIndex(origin).documents.find((item) =>
    item.url.endsWith(`/.well-known/agent-docs/${document}`),
  );

  if (!entry) return new Response("Not found", { status: 404 });

  return new Response(
    getAgentDocument(entry.name, entry.description, entry.url),
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    },
  );
}
