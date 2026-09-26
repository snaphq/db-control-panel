/// <reference path="../aws-lite-s3.d.ts" />

import type {
  FileMetadata,
  ListOptions,
  ListResult,
  StorageAcl,
  StorageClient,
  UploadOptions,
} from "../types";

const PART_SIZE = 5 * 1024 * 1024; // 5 MB minimum part size for S3 multipart

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
}

interface AwsLiteS3 {
  PutObject(params: Record<string, unknown>): Promise<void>;
  GetObject(params: Record<string, unknown>): Promise<unknown>;
  DeleteObject(params: Record<string, unknown>): Promise<void>;
  HeadBucket(params: Record<string, unknown>): Promise<void>;
  PutObjectAcl(params: Record<string, unknown>): Promise<void>;
  CreateMultipartUpload(
    params: Record<string, unknown>,
  ): Promise<{ UploadId: string }>;
  UploadPart(params: Record<string, unknown>): Promise<{ ETag: string }>;
  CompleteMultipartUpload(params: Record<string, unknown>): Promise<void>;
  ListObjectsV2(params: Record<string, unknown>): Promise<{
    Contents?: S3Object[];
    NextContinuationToken?: string;
    IsTruncated?: boolean;
  }>;
}

interface AwsLiteClient {
  S3: AwsLiteS3;
}

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

function requireConfig(): S3Config {
  const missing: string[] = [];
  const bucket = process.env.S3_BUCKET ?? "";
  const region = process.env.S3_REGION ?? "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  const endpoint = process.env.S3_ENDPOINT;

  if (!bucket) missing.push("S3_BUCKET");
  if (!region) missing.push("S3_REGION");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required S3 env vars: ${missing.join(", ")}. Configure them in .env.local.`,
    );
  }

  return { bucket, region, accessKeyId, secretAccessKey, endpoint };
}

async function getClient() {
  const cfg = requireConfig();
  const [awsLite, s3Plugin] = await Promise.all([
    import("@aws-lite/client").then((m) => m.default ?? m),
    import("@aws-lite/s3").then((m) => m.default ?? m),
  ]);

  return awsLite({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    plugins: [s3Plugin],
  });
}

export const s3Provider: StorageClient = {
  async uploadFile(key, body, options?: UploadOptions): Promise<FileMetadata> {
    const cfg = requireConfig();
    const aws = await getClient();

    let bodyBuffer: Buffer;
    if (body instanceof Blob) {
      bodyBuffer = Buffer.from(await body.arrayBuffer());
    } else if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      bodyBuffer = Buffer.concat(chunks);
    } else {
      bodyBuffer = body as Buffer;
    }

    await (aws as unknown as AwsLiteClient).S3.PutObject({
      Bucket: cfg.bucket,
      Key: key,
      Body: bodyBuffer,
      ContentType: options?.contentType,
      ...(options?.acl
        ? { ACL: options.acl === "public" ? "public-read" : "private" }
        : {}),
      ...(options?.metadata ? { Metadata: options.metadata } : {}),
    });

    return {
      key,
      url: buildObjectUrl(cfg, key),
      size: bodyBuffer.byteLength,
      contentType: options?.contentType,
      uploadedAt: new Date(),
    };
  },

  async uploadMultipart(
    key,
    body,
    options?: UploadOptions,
  ): Promise<FileMetadata> {
    const cfg = requireConfig();
    const aws = await getClient();

    const bodyBuffer =
      body instanceof Blob
        ? Buffer.from(await body.arrayBuffer())
        : (body as Buffer);

    const { UploadId } = await (
      aws as unknown as AwsLiteClient
    ).S3.CreateMultipartUpload({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: options?.contentType,
      ...(options?.acl
        ? { ACL: options.acl === "public" ? "public-read" : "private" }
        : {}),
    });

    const parts: { PartNumber: number; ETag: string }[] = [];
    const totalParts = Math.ceil(bodyBuffer.byteLength / PART_SIZE);

    for (let i = 0; i < totalParts; i++) {
      const start = i * PART_SIZE;
      const end = Math.min(start + PART_SIZE, bodyBuffer.byteLength);
      const chunk = bodyBuffer.subarray(start, end);
      const partNumber = i + 1;

      const result = await (aws as unknown as AwsLiteClient).S3.UploadPart({
        Bucket: cfg.bucket,
        Key: key,
        UploadId,
        PartNumber: partNumber,
        Body: chunk,
      });

      parts.push({ PartNumber: partNumber, ETag: result.ETag });
    }

    await (aws as unknown as AwsLiteClient).S3.CompleteMultipartUpload({
      Bucket: cfg.bucket,
      Key: key,
      UploadId,
      MultipartUpload: { Parts: parts },
    });

    return {
      key,
      url: buildObjectUrl(cfg, key),
      size: bodyBuffer.byteLength,
      contentType: options?.contentType,
      uploadedAt: new Date(),
    };
  },

  async downloadSigned(key, expiresInSeconds = 3600): Promise<string> {
    // aws-lite does not have built-in presign support.
    // Route through our API proxy which adds auth headers server-side.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const params = new URLSearchParams({ key, expires: String(expires) });
    return `${appUrl}/api/storage/signed?${params}`;
  },

  async listFiles(options?: ListOptions): Promise<ListResult> {
    const cfg = requireConfig();
    const aws = await getClient();

    const result = await (aws as unknown as AwsLiteClient).S3.ListObjectsV2({
      Bucket: cfg.bucket,
      Prefix: options?.prefix,
      MaxKeys: options?.limit ?? 100,
      ContinuationToken: options?.cursor,
    });

    const contents: S3Object[] = result.Contents ?? [];
    return {
      files: contents.map((obj) => ({
        key: obj.Key,
        url: buildObjectUrl(cfg, obj.Key),
        size: obj.Size,
        uploadedAt: new Date(obj.LastModified),
      })),
      cursor: result.NextContinuationToken,
      hasMore: result.IsTruncated === true,
    };
  },

  async deleteFile(key): Promise<void> {
    const cfg = requireConfig();
    const aws = await getClient();
    await (aws as unknown as AwsLiteClient).S3.DeleteObject({
      Bucket: cfg.bucket,
      Key: key,
    });
  },

  async setAcl(key, acl: StorageAcl): Promise<void> {
    const cfg = requireConfig();
    const aws = await getClient();
    await (aws as unknown as AwsLiteClient).S3.PutObjectAcl({
      Bucket: cfg.bucket,
      Key: key,
      ACL: acl === "public" ? "public-read" : "private",
    });
  },
};

function buildObjectUrl(cfg: S3Config, key: string): string {
  if (cfg.endpoint) {
    const base = cfg.endpoint.replace(/\/$/, "");
    return `${base}/${cfg.bucket}/${key}`;
  }
  return `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`;
}

export async function validateS3Connection(): Promise<void> {
  const cfg = requireConfig();
  const aws = await getClient();
  await (aws as unknown as AwsLiteClient).S3.HeadBucket({ Bucket: cfg.bucket });
}
