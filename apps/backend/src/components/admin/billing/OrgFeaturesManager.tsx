"use client";

import { FEATURE_DEFINITIONS } from "@repo/billing/constants";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/react-ui/components/ui/dialog";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/react-ui/components/ui/select";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrgFeature {
  id: string;
  organizationId: string;
  featureKey: string;
  featureValue: string;
  grantedBy: string | null;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function OrgFeaturesManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [features, setFeatures] = useState<OrgFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFeatureKey, setNewFeatureKey] = useState("");
  const [newFeatureValue, setNewFeatureValue] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Search organizations
  const searchOrganizations = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setOrganizations([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/organizations?search=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Failed to search organizations");
      const data = await res.json();
      setOrganizations(data.organizations || data || []);
    } catch (error) {
      console.error("Error searching organizations:", error);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchOrganizations(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOrganizations]);

  // Fetch features for selected org
  useEffect(() => {
    if (!selectedOrgId) {
      setFeatures([]);
      return;
    }

    const fetchFeatures = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/org-features?organizationId=${selectedOrgId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch features");
        const data = await res.json();
        setFeatures(data);
      } catch (error) {
        console.error("Error fetching features:", error);
        toast.error("Failed to load organization features");
      } finally {
        setLoading(false);
      }
    };

    fetchFeatures();
  }, [selectedOrgId]);

  const handleAddFeature = async () => {
    if (!selectedOrgId || !newFeatureKey || newFeatureValue === "") {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/org-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          featureKey: newFeatureKey,
          featureValue: newFeatureValue,
          reason: newReason || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save feature");

      // Refresh features
      const featuresRes = await fetch(
        `/api/admin/org-features?organizationId=${selectedOrgId}`,
      );
      const data = await featuresRes.json();
      setFeatures(data);

      setDialogOpen(false);
      setNewFeatureKey("");
      setNewFeatureValue("");
      setNewReason("");
      toast.success("Feature override added");
    } catch (error) {
      console.error("Error adding feature:", error);
      toast.error("Failed to add feature override");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFeature = async (featureKey: string) => {
    if (!selectedOrgId) return;

    try {
      const res = await fetch("/api/admin/org-features", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          featureKey,
        }),
      });

      if (!res.ok) throw new Error("Failed to delete feature");

      setFeatures(features.filter((f) => f.featureKey !== featureKey));
      toast.success("Feature override removed");
    } catch (error) {
      console.error("Error deleting feature:", error);
      toast.error("Failed to delete feature override");
    }
  };

  const getFeatureDefinition = (key: string) => {
    return FEATURE_DEFINITIONS.find((f) => f.key === key);
  };

  const formatFeatureValue = (key: string, value: string) => {
    const def = getFeatureDefinition(key);
    if (def?.type === "boolean") {
      return value === "true" ? "Enabled" : "Disabled";
    }
    if (def?.type === "number") {
      return value === "-1" ? "Unlimited" : value;
    }
    return value;
  };

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  return (
    <div className="space-y-6">
      {/* Organization Search */}
      <div className="space-y-2">
        <Label>Search Organization</Label>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </div>
        )}
      </div>

      {/* Organization Results */}
      {organizations.length > 0 && !selectedOrgId && (
        <div className="rounded-md border max-w-md">
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-muted/50 border-b last:border-b-0 transition-colors"
              onClick={() => setSelectedOrgId(org.id)}
            >
              <div className="font-medium">{org.name}</div>
              <div className="text-xs text-muted-foreground">@{org.slug}</div>
            </button>
          ))}
        </div>
      )}

      {/* Selected Organization */}
      {selectedOrgId && selectedOrg && (
        <div className="flex items-center gap-4 p-4 rounded-md border bg-muted/30 max-w-md">
          <div className="flex-1">
            <div className="font-medium">{selectedOrg.name}</div>
            <div className="text-xs text-muted-foreground">
              @{selectedOrg.slug}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedOrgId("");
              setSearchQuery("");
            }}
          >
            Change
          </Button>
        </div>
      )}

      {/* Features Table */}
      {selectedOrgId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Feature Overrides</h3>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Override
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Feature Override</DialogTitle>
                  <DialogDescription>
                    Grant or revoke a feature for this specific organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Feature</Label>
                    <Select
                      value={newFeatureKey}
                      onValueChange={setNewFeatureKey}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a feature..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_DEFINITIONS.map((def) => (
                          <SelectItem key={def.key} value={def.key}>
                            <div>
                              <div>{def.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {def.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    {(() => {
                      const def = getFeatureDefinition(newFeatureKey);
                      if (def?.type === "boolean") {
                        return (
                          <Select
                            value={newFeatureValue}
                            onValueChange={setNewFeatureValue}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select value..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          type={def?.type === "number" ? "number" : "text"}
                          value={newFeatureValue}
                          onChange={(e) => setNewFeatureValue(e.target.value)}
                          placeholder={
                            def?.type === "number"
                              ? "Enter number (-1 for unlimited)"
                              : "Enter value"
                          }
                        />
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label>Reason (optional)</Label>
                    <Input
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      placeholder="e.g., Early adopter bonus, Partner deal"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddFeature} disabled={saving}>
                    {saving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : features.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              No feature overrides for this organization. Overrides let you
              grant or revoke features independently of their subscription plan.
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Feature
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Value
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Reason
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((feature) => {
                    const def = getFeatureDefinition(feature.featureKey);
                    return (
                      <tr key={feature.featureKey} className="border-b">
                        <td className="p-4 align-middle">
                          <div>
                            <div className="font-medium">
                              {def?.label || feature.featureKey}
                            </div>
                            <code className="text-xs text-muted-foreground">
                              {feature.featureKey}
                            </code>
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge
                            variant={
                              def?.type === "boolean" &&
                              feature.featureValue === "true"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {formatFeatureValue(
                              feature.featureKey,
                              feature.featureValue,
                            )}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {feature.reason || "-"}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDeleteFeature(feature.featureKey)
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedOrgId &&
        organizations.length === 0 &&
        searchQuery.length >= 2 &&
        !searching && (
          <div className="rounded-md border p-8 text-center text-muted-foreground">
            No organizations found matching "{searchQuery}"
          </div>
        )}

      {!selectedOrgId && searchQuery.length < 2 && (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Search for an organization to manage their feature overrides.
        </div>
      )}
    </div>
  );
}
