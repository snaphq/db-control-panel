export default function WorkspaceToolsLoading() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 lg:p-6" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
