"use client";

import type { FileMetadata } from "@repo/object-storage";
import { Button } from "@repo/ui/components/ui/button";
import { Copy, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface StoragePageProps {
  workspaceSlug: string;
  isConfigured: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function StoragePage({ isConfigured }: StoragePageProps) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await fetch(`/api/storage/list?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data: { files: FileMetadata[]; cursor?: string; hasMore: boolean } =
        await res.json();
      setFiles((prev) => (nextCursor ? [...prev, ...data.files] : data.files));
      setCursor(data.cursor);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConfigured) fetchFiles();
    else setLoading(false);
  }, [isConfigured, fetchFiles]);

  async function uploadFiles(fileList: FileList) {
    setUploading(true);
    try {
      await Promise.all(
        Array.from(fileList).map(async (file) => {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/storage/upload", {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
        }),
      );
      await fetchFiles();
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(key: string) {
    const encoded = encodeURIComponent(key);
    await fetch(`/api/storage/${encoded}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }

  async function copySignedUrl(key: string) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const res = await fetch(
      `/api/storage/signed?key=${encodeURIComponent(key)}&expires=${expires}`,
    );
    if (!res.ok) return;
    const { url } = await res.json();
    await navigator.clipboard.writeText(url);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  if (!isConfigured) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <p className="font-medium">Object storage is not configured.</p>
        <p className="text-sm mt-1">
          Set{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            OBJECT_STORAGE_PROVIDER
          </code>{" "}
          and its credentials in the environment, then restart the app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload zone — label wraps the input for native keyboard + click accessibility */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag & drop files here, or{" "}
              <span className="text-primary underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Files &gt; 5 MB are uploaded via multipart
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </label>

      {/* File list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No files uploaded yet.
        </p>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    Size
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    Uploaded
                  </th>
                  <th className="w-[90px]" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {files.map((file) => (
                  <tr
                    key={file.key}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2 font-mono text-xs max-w-[260px] truncate">
                      {file.key}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatBytes(file.size)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {file.contentType ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copySignedUrl(file.key)}
                          title="Copy link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteFile(file.key)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <Button
              variant="outline"
              onClick={() => fetchFiles(cursor)}
              disabled={loading}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
