import { auth } from "@repo/auth/server";
import {
  type HandleUploadBody,
  handleUpload,
} from "@repo/object-storage/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/account/avatar/upload
 * Handshake endpoint for @vercel/blob/client `upload()`.
 * Generates a signed token scoped to the current user's avatar path.
 *
 * The client MUST upload to `avatars/<userId>/...`. We enforce that here so
 * one user cannot overwrite another's avatar blob.
 */
export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN)." },
      { status: 503 },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const expectedPrefix = `avatars/${userId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid upload path.");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      onUploadCompleted: async () => {
        // No-op. The client PATCHes /api/account with the resulting URL.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
