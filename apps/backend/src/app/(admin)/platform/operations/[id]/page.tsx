import { AutoRefresh } from "@/components/admin/platform/auto-refresh";
import { OperationDetail } from "@/components/admin/platform/operation-detail";
import { PlatformUnavailable } from "@/components/admin/platform/platform-unavailable";
import { requireAdmin } from "@/lib/admin-auth";
import { OPERATION_ACTION_LABELS } from "@/lib/platform/format";
import { loadPlatform } from "@/lib/platform/load";
import { isActiveStatus } from "@/lib/platform/operations";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PlatformOperationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const result = await loadPlatform((client) => client.getOperation(id));
  if (result.status === "unavailable" && result.reason === "not_found") {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/platform/operations"
          className="text-sm text-muted-foreground underline"
        >
          All platform operations
        </Link>
        <h1 className="text-2xl font-normal tracking-tight">
          {result.status === "ok"
            ? OPERATION_ACTION_LABELS[result.data.operation.action]
            : "Platform operation"}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">{id}</p>
      </div>
      {result.status === "ok" ? (
        <>
          <AutoRefresh active={isActiveStatus(result.data.operation.status)} />
          <OperationDetail operation={result.data.operation} />
        </>
      ) : (
        <PlatformUnavailable result={result} />
      )}
    </div>
  );
}
