"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface AppSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// Common settings that can be configured
const COMMON_SETTINGS = [
  {
    key: "enterprise_contact_link",
    label: "Enterprise Contact Link",
    description: "URL or mailto link for enterprise plan inquiries",
    placeholder: "mailto:sales@example.com or https://example.com/contact",
  },
  {
    key: "trial_duration_days",
    label: "Trial Duration (Days)",
    description: "Number of days for free trial period",
    placeholder: "14",
  },
  {
    key: "free_workspace_limit",
    label: "Free Workspace Limit",
    description: "Maximum free workspaces per user",
    placeholder: "1",
  },
  {
    key: "pending_workspace_ttl_hours",
    label: "Pending Workspace TTL (Hours)",
    description: "Hours before pending workspaces are cleaned up",
    placeholder: "24",
  },
];

export function AppSettingsManager() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch all settings
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("Failed to fetch settings");
        const data = await res.json();
        setSettings(data);
      } catch (error) {
        console.error("Error fetching settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSetting = async () => {
    if (!newKey || newValue === "") {
      toast.error("Please fill in key and value");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey,
          value: newValue,
          description: newDescription || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save setting");

      // Refresh settings
      const settingsRes = await fetch("/api/admin/settings");
      const data = await settingsRes.json();
      setSettings(data);

      setDialogOpen(false);
      setEditingKey(null);
      setNewKey("");
      setNewValue("");
      setNewDescription("");
      toast.success(editingKey ? "Setting updated" : "Setting added");
    } catch (error) {
      console.error("Error saving setting:", error);
      toast.error("Failed to save setting");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (!res.ok) throw new Error("Failed to delete setting");

      setSettings(settings.filter((s) => s.key !== key));
      toast.success("Setting deleted");
    } catch (error) {
      console.error("Error deleting setting:", error);
      toast.error("Failed to delete setting");
    }
  };

  const openEditDialog = (setting: AppSetting) => {
    setEditingKey(setting.key);
    setNewKey(setting.key);
    setNewValue(setting.value);
    setNewDescription(setting.description || "");
    setDialogOpen(true);
  };

  const openAddDialog = (preset?: (typeof COMMON_SETTINGS)[0]) => {
    setEditingKey(null);
    setNewKey(preset?.key || "");
    setNewValue("");
    setNewDescription(preset?.description || "");
    setDialogOpen(true);
  };

  const getSettingMeta = (key: string) => {
    return COMMON_SETTINGS.find((s) => s.key === key);
  };

  // Settings that haven't been configured yet
  const unconfiguredSettings = COMMON_SETTINGS.filter(
    (common) => !settings.find((s) => s.key === common.key),
  );

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">App Settings</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => openAddDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Setting
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingKey ? "Edit Setting" : "Add Setting"}
              </DialogTitle>
              <DialogDescription>
                Configure application-wide settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="setting_key"
                  disabled={!!editingKey}
                />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={
                    getSettingMeta(newKey)?.placeholder || "Enter value"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What this setting does"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSetting} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Add for Common Settings */}
      {unconfiguredSettings.length > 0 && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Quick Add</Label>
          <div className="flex flex-wrap gap-2">
            {unconfiguredSettings.map((setting) => (
              <Button
                key={setting.key}
                variant="outline"
                size="sm"
                onClick={() => openAddDialog(setting)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {setting.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Settings Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No settings configured. Add settings to customize application
          behavior.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Setting
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Value
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Description
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => {
                const meta = getSettingMeta(setting.key);
                return (
                  <tr key={setting.key} className="border-b">
                    <td className="p-4 align-middle">
                      <div>
                        <div className="font-medium">
                          {meta?.label || setting.key}
                        </div>
                        <code className="text-xs text-muted-foreground">
                          {setting.key}
                        </code>
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {setting.value}
                      </code>
                    </td>
                    <td className="p-4 align-middle text-sm text-muted-foreground max-w-xs truncate">
                      {setting.description || meta?.description || "-"}
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(setting)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSetting(setting.key)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
