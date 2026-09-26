import { ratelimit } from "@repo/core/ratelimiter";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (ratelimit) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const { success, pending, limit, reset, remaining } =
      await ratelimit.limit(ip);

    if (!success) {
      console.log("limit", limit);
      console.log("reset", reset);
      console.log("remaining", remaining);

      return NextResponse.json("Rate Limited", { status: 429 });
    }
    console.log("remaining", remaining);
  }

  return NextResponse.json("Success", { status: 200 });
}
