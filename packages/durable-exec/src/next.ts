/**
 * @repo/durable-exec/next
 * Exports a fully-wired Inngest serve() handler for Next.js App Router.
 * Import GET/POST/PUT from this module in your api/inngest/route.ts.
 */

import { serve } from "inngest/next";
import { inngest } from "./client";
import { allFunctions } from "./functions";

type Handler = (req: Request) => Promise<Response>;

const handler = serve({
  client: inngest,
  functions: allFunctions,
}) as unknown as {
  GET: Handler;
  POST: Handler;
  PUT: Handler;
};

export const GET = (req: Request) => handler.GET(req);
export const POST = (req: Request) => handler.POST(req);
export const PUT = (req: Request) => handler.PUT(req);
