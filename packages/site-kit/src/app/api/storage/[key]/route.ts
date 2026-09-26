import { createStorageClient } from "@repo/object-storage";
import { type NextRequest, NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  if (!process.env.OBJECT_STORAGE_PROVIDER) {
    return NextResponse.json(
      { error: "Object storage is not configured." },
      { status: 503 },
    );
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const client = createStorageClient();
  await client.deleteFile(decodedKey);

  return new NextResponse(null, { status: 204 });
}
