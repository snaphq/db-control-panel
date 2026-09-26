"use client";

import type { Tenant, User } from "@repo/database/schema";
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
import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function CreateOrganizationDialog({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [tenantId, setTenantId] = useState("default");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setUsers(data.filter((user) => user.tenantId === tenantId));
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [open, tenantId]);

  function onNameChange(v: string) {
    setName(v);
    setSlug(
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  }

  async function submit() {
    if (!name.trim() || !slug.trim() || !ownerUserId) {
      toast.error("Name, slug, and owner are all required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          ownerUserId,
          tenantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to create organization");
        return;
      }
      toast.success("Organization created");
      setOpen(false);
      setName("");
      setSlug("");
      setOwnerUserId("");
      setTenantId("default");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Building2 className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Creates the org, assigns the chosen user as owner, and seeds a
            default project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="create-org-tenant">Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger id="create-org-tenant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-org-name">Name</Label>
            <Input
              id="create-org-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Acme Marketing"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-org-slug">Slug</Label>
            <Input
              id="create-org-slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="acme-marketing"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-org-owner">Owner</Label>
            <Select
              value={ownerUserId}
              onValueChange={setOwnerUserId}
              disabled={loadingUsers}
            >
              <SelectTrigger id="create-org-owner">
                <SelectValue
                  placeholder={loadingUsers ? "Loading users…" : "Pick a user"}
                />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {u.publicEmail}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
