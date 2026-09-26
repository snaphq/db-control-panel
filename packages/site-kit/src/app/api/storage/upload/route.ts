import { createStorageClient } from "@repo/object-storage";
import { type NextRequest, NextResponse } from "next/server";

const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  if (!process.env.OBJECT_STORAGE_PROVIDER) {
    return NextResponse.json(
      { error: "Object storage is not configured." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const key = `${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = createStorageClient();

  const metadata =
    buffer.byteLength > MULTIPART_THRESHOLD
      ? await client.uploadMultipart(key, buffer, {
          contentType: file.type || undefined,
        })
      : await client.uploadFile(key, buffer, {
          contentType: file.type || undefined,
        });

  return NextResponse.json(metadata);
}
