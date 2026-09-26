export default function WorkspaceLoading() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 lg:p-6" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
