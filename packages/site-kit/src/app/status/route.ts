import { absoluteUrl } from "@repo/core/site-config";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      service: "alloydb",
      url: absoluteUrl("/"),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300",
      },
    },
  );
}
