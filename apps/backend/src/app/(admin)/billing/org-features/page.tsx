import { OrgFeaturesManager } from "@/components/admin/billing";

export default function OrgFeaturesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Organization Overrides
        </h1>
        <p className="text-muted-foreground">
          Grant or revoke features for specific organizations, independent of
          their subscription plan.
        </p>
      </div>
      <OrgFeaturesManager />
    </div>
  );
}
