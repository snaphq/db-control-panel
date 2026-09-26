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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/react-ui/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface FunnelStep {
  label: string;
  path: string;
  matchType: "exact" | "prefix";
}

interface FunnelRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  steps: FunnelStep[];
  orderIndex: number;
  updatedAt: string | Date;
}

interface FormState {
  name: string;
  description: string;
  steps: FunnelStep[];
  orderIndex: number;
}

const EMPTY_STEP: FunnelStep = { label: "", path: "", matchType: "exact" };

export function FunnelsManager({ initial }: { initial: FunnelRow[] }) {
  const [rows, setRows] = useState<FunnelRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FunnelRow | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    steps: [{ ...EMPTY_STEP }, { ...EMPTY_STEP }],
    orderIndex: 0,
  });
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      steps: [
        { label: "Landing", path: "/", matchType: "exact" },
        { label: "Sign up", path: "/sign-up", matchType: "exact" },
      ],
      orderIndex: rows.length,
    });
    setOpen(true);
  }

  function openEdit(row: FunnelRow) {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? "",
      steps: row.steps.length > 0 ? row.steps : [{ ...EMPTY_STEP }],
      orderIndex: row.orderIndex,
    });
    setOpen(true);
  }

  function setStep(index: number, patch: Partial<FunnelStep>) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addStep() {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, { ...EMPTY_STEP }] }));
  }

  function removeStep(index: number) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setForm((prev) => {
      const next = [...prev.steps];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, steps: next };
    });
  }

  async function handleSave() {
    const name = form.name.trim();
    const cleanSteps = form.steps
      .map((s) => ({
        label: s.label.trim(),
        path: s.path.trim(),
        matchType: s.matchType,
      }))
      .filter((s) => s.label && s.path);

    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (cleanSteps.length < 2) {
      toast.error("Add at least 2 steps");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description.trim() || null,
        steps: cleanSteps,
        orderIndex: form.orderIndex,
      };
      if (editing) {
        const res = await fetch(`/api/admin/funnels/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Update failed");
        }
        const updated = (await res.json()) as FunnelRow;
        setRows((prev) =>
          prev
            .map((r) => (r.id === updated.id ? updated : r))
            .sort((a, b) => a.orderIndex - b.orderIndex),
        );
        toast.success("Funnel updated");
      } else {
        const res = await fetch("/api/admin/funnels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Create failed");
        }
        const created = (await res.json()) as FunnelRow;
        setRows((prev) =>
          [...prev, created].sort((a, b) => a.orderIndex - b.orderIndex),
        );
        toast.success("Funnel created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: FunnelRow) {
    if (!confirm(`Delete funnel "${row.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/funnels/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Funnel deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function reorder(row: FunnelRow, direction: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === row.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx];
    const b = rows[swapIdx];
    // Optimistic swap.
    const next = [...rows];
    next[idx] = { ...b, orderIndex: a.orderIndex };
    next[swapIdx] = { ...a, orderIndex: b.orderIndex };
    setRows(next.sort((x, y) => x.orderIndex - y.orderIndex));
    try {
      await Promise.all([
        fetch(`/api/admin/funnels/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIndex: b.orderIndex }),
        }),
        fetch(`/api/admin/funnels/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIndex: a.orderIndex }),
        }),
      ]);
    } catch (e) {
      toast.error("Reorder failed; refresh to resync");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Funnels</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              New funnel
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit funnel" : "New funnel"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Signup acquisition"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Landing → pricing → sign-up"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Steps</Label>
                  <Button size="sm" variant="outline" onClick={addStep}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add step
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each step matches a <code>$pageview</code> event by{" "}
                  <code>$pathname</code>. Use <em>exact</em> for a single page,{" "}
                  <em>prefix</em> to match anything containing the path.
                </p>
                <ul className="space-y-2">
                  {form.steps.map((step, i) => (
                    <li
                      key={`step-${i.toString()}`}
                      className="flex items-start gap-2 rounded-md border p-2"
                    >
                      <div className="flex flex-col gap-1 pt-1.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {i + 1}
                        </span>
                      </div>
                      <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr_120px]">
                        <Input
                          placeholder="Label (e.g. Landing)"
                          value={step.label}
                          onChange={(e) =>
                            setStep(i, { label: e.target.value })
                          }
                        />
                        <Input
                          placeholder="/path"
                          value={step.path}
                          onChange={(e) => setStep(i, { path: e.target.value })}
                        />
                        <Select
                          value={step.matchType}
                          onValueChange={(v) =>
                            setStep(i, {
                              matchType: v as "exact" | "prefix",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exact">exact</SelectItem>
                            <SelectItem value="prefix">contains</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStep(i, -1)}
                          disabled={i === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStep(i, 1)}
                          disabled={i === form.steps.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeStep(i)}
                          disabled={form.steps.length <= 1}
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
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

      {rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No funnels yet. Click <strong>New funnel</strong> to create one.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Order
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Name
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Steps
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b">
                  <td className="p-4 align-middle">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === 0}
                        onClick={() => reorder(row, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === rows.length - 1}
                        onClick={() => reorder(row, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-4 align-middle">
                    <div className="font-medium">{row.name}</div>
                    {row.description && (
                      <div className="text-xs text-muted-foreground">
                        {row.description}
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-middle">
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {row.steps.map((s, idx) => (
                        <span
                          key={`${row.id}-${idx.toString()}`}
                          className="inline-flex items-center gap-1"
                        >
                          {idx > 0 && <span className="opacity-60">→</span>}
                          <code className="rounded bg-muted px-1 py-0.5">
                            {s.path}
                          </code>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 align-middle text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(row)}
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
