import { createStorageClient } from "@repo/object-storage";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!process.env.OBJECT_STORAGE_PROVIDER) {
    return NextResponse.json(
      { error: "Object storage is not configured." },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const prefix = searchParams.get("prefix") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "100");

  const client = createStorageClient();
  const result = await client.listFiles({ prefix, cursor, limit });

  return NextResponse.json(result);
}
