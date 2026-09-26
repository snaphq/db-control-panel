import { createStorageClient } from "@repo/object-storage";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!process.env.OBJECT_STORAGE_PROVIDER) {
    return NextResponse.json(
      { error: "Object storage is not configured." },
      { status: 503 },
    );
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json(
      { error: "Missing key parameter." },
      { status: 400 },
    );
  }

  const expiresParam = req.nextUrl.searchParams.get("expires");
  const expiresInSeconds = expiresParam
    ? Math.max(0, Number(expiresParam) - Math.floor(Date.now() / 1000))
    : 3600;

  const client = createStorageClient();
  const url = await client.downloadSigned(key, expiresInSeconds);

  return NextResponse.json({ url });
}
