"use client";

import type { Tenant } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type TenantRow = {
  tenant: Tenant;
  domain: string | null;
};

function TenantDialog({
  tenant,
  domain,
}: {
  tenant?: Tenant;
  domain?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(tenant?.id ?? "");
  const [slug, setSlug] = useState(tenant?.slug ?? "");
  const [name, setName] = useState(tenant?.name ?? "");
  const [platformName, setPlatformName] = useState(tenant?.platformName ?? "");
  const [primaryDomain, setPrimaryDomain] = useState(domain ?? "");
  const [supportEmail, setSupportEmail] = useState(tenant?.supportEmail ?? "");
  const [logoUrl, setLogoUrl] = useState(tenant?.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(tenant?.faviconUrl ?? "");
  const [status, setStatus] = useState(tenant?.status ?? "active");
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(tenant);

  async function submit() {
    if (
      !slug.trim() ||
      !name.trim() ||
      !platformName.trim() ||
      !primaryDomain.trim()
    ) {
      toast.error("Slug, name, platform name, and domain are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/tenants/${tenant?.id}` : "/api/admin/tenants",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: id.trim() || undefined,
            slug: slug.trim(),
            name: name.trim(),
            platformName: platformName.trim(),
            domain: primaryDomain.trim(),
            supportEmail: supportEmail.trim(),
            logoUrl: logoUrl.trim(),
            faviconUrl: faviconUrl.trim(),
            status,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to save tenant");
        return;
      }
      toast.success(editing ? "Tenant updated" : "Tenant created");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editing ? "outline" : "default"}>
          {editing ? (
            <Pencil className="mr-2 h-4 w-4" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {editing ? "Edit" : "Create Tenant"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit tenant" : "Create tenant"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="tenant-id">ID</Label>
              <Input
                id="tenant-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="default"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-domain">Primary domain</Label>
              <Input
                id="tenant-domain"
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
                placeholder="app.example.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Name</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-platform-name">Platform name</Label>
              <Input
                id="tenant-platform-name"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-support-email">Support email</Label>
            <Input
              id="tenant-support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenant-logo">Logo URL</Label>
              <Input
                id="tenant-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-favicon">Favicon URL</Label>
              <Input
                id="tenant-favicon"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="tenant-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TenantTable({ rows }: { rows: TenantRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TenantDialog />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left font-medium">Name</th>
              <th className="h-12 px-4 text-left font-medium">Platform</th>
              <th className="h-12 px-4 text-left font-medium">Domain</th>
              <th className="h-12 px-4 text-left font-medium">Status</th>
              <th className="h-12 px-4 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.tenant.id}:${row.domain ?? ""}`}
                className="border-b"
              >
                <td className="p-4 align-middle">
                  <div className="font-medium">{row.tenant.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {row.tenant.id} / {row.tenant.slug}
                  </div>
                </td>
                <td className="p-4 align-middle">{row.tenant.platformName}</td>
                <td className="p-4 align-middle">{row.domain ?? "None"}</td>
                <td className="p-4 align-middle">
                  <Badge
                    variant={
                      row.tenant.status === "active" ? "default" : "outline"
                    }
                  >
                    {row.tenant.status}
                  </Badge>
                </td>
                <td className="p-4 align-middle">
                  <TenantDialog tenant={row.tenant} domain={row.domain} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
