"use client";

import { Button } from "@repo/react-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/react-ui/components/ui/dialog";
import { Input } from "@repo/react-ui/components/ui/input";
import { Label } from "@repo/react-ui/components/ui/label";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PlanTierRow {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  isPaid: boolean;
  sortOrder: number;
}

export function PlanTiersManager({
  initialTiers,
}: {
  initialTiers: PlanTierRow[];
}) {
  const [tiers, setTiers] = useState<PlanTierRow[]>(initialTiers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlanTierRow | null>(null);
  const [form, setForm] = useState({
    key: "",
    displayName: "",
    description: "",
    isPaid: false,
    sortOrder: 0,
  });
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({
      key: "",
      displayName: "",
      description: "",
      isPaid: false,
      sortOrder: tiers.length,
    });
    setDialogOpen(true);
  }

  function openEdit(tier: PlanTierRow) {
    setEditing(tier);
    setForm({
      key: tier.key,
      displayName: tier.displayName,
      description: tier.description ?? "",
      isPaid: tier.isPaid,
      sortOrder: tier.sortOrder,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.key.trim() || !form.displayName.trim()) {
      toast.error("Key and display name are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/admin/plan-tiers/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName.trim(),
            description: form.description.trim() || null,
            isPaid: form.isPaid,
            sortOrder: form.sortOrder,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        const updated = await res.json();
        setTiers((prev) =>
          prev
            .map((t) => (t.id === updated.id ? updated : t))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
      } else {
        const res = await fetch("/api/admin/plan-tiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: form.key.trim(),
            displayName: form.displayName.trim(),
            description: form.description.trim() || null,
            isPaid: form.isPaid,
            sortOrder: form.sortOrder,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        const created = await res.json();
        setTiers((prev) =>
          [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder),
        );
      }
      setDialogOpen(false);
      toast.success(editing ? "Tier updated" : "Tier created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save tier");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tier: PlanTierRow) {
    if (tier.key === "free") {
      toast.error("Cannot delete the free tier");
      return;
    }
    if (!confirm(`Delete plan tier "${tier.displayName}"?`)) return;
    try {
      const res = await fetch(`/api/admin/plan-tiers/${tier.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setTiers((prev) => prev.filter((t) => t.id !== tier.id));
      toast.success("Tier deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete tier");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Plan Tiers</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit Plan Tier" : "Add Plan Tier"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="tier1"
                  disabled={!!editing}
                />
                <p className="text-xs text-muted-foreground">
                  Internal identifier (e.g. <code>free</code>,{" "}
                  <code>tier1</code>). Cannot be changed after creation.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                  placeholder="Pro"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Best for growing teams"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Paid plan</Label>
                  <p className="text-xs text-muted-foreground">
                    Affects whether the Upgrade CTA shows for orgs on this tier.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={form.isPaid}
                  onChange={(e) =>
                    setForm({ ...form, isPaid: e.target.checked })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tiers.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No plan tiers yet. Run <code>bun run db:seed:billing</code> to seed
          defaults.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Key
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Display Name
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Paid
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Sort
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id} className="border-b">
                  <td className="p-4 align-middle">
                    <code className="text-sm">{tier.key}</code>
                  </td>
                  <td className="p-4 align-middle">
                    <div className="font-medium">{tier.displayName}</div>
                    {tier.description && (
                      <div className="text-xs text-muted-foreground">
                        {tier.description}
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-middle">
                    {tier.isPaid ? "Yes" : "No"}
                  </td>
                  <td className="p-4 align-middle">{tier.sortOrder}</td>
                  <td className="p-4 align-middle text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(tier)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(tier)}
                        disabled={tier.key === "free"}
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
      )}
    </div>
  );
}
