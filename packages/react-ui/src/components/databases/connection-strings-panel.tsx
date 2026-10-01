"use client";

import type { Database, Endpoint, Role } from "@repo/control-plane-contract";
import { useState } from "react";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { connectionStrings } from "./connection-urls";
import { CopyField } from "./copy-field";

interface ConnectionStringsPanelProps {
  endpoint: Endpoint;
  roles: Role[];
  databases: Database[];
}

/** Connection strings for one endpoint. Passwords are never known here. */
export function ConnectionStringsPanel({
  endpoint,
  roles,
  databases,
}: ConnectionStringsPanelProps) {
  const [role, setRole] = useState(roles[0]?.name ?? "");
  const [databaseName, setDatabaseName] = useState(databases[0]?.name ?? "");
  const database = databases.find((d) => d.name === databaseName);

  if (!role || !database) {
    return (
      <p className="text-sm text-muted-foreground">
        Connection strings appear once the branch has a role and a database.
      </p>
    );
  }
  const urls = connectionStrings(endpoint, role, database);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Database</Label>
          <Select value={databaseName} onValueChange={setDatabaseName}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {databases.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <CopyField label="Direct connection" value={urls.direct} />
      <CopyField label="Pooled connection (PgBouncer)" value={urls.pooled} />
      <CopyField label="SQL over HTTP" value={urls.sqlOverHttp} />
      {urls.dataApi ? (
        <CopyField label="Data API URL" value={urls.dataApi} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Enable the Data API on{" "}
          <span className="font-mono">{database.name}</span> to get a REST URL
          for it.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Replace <span className="font-mono">&lt;password&gt;</span> with the
        role's password. Passwords are shown once, when they are created or
        reset.
      </p>
    </div>
  );
}
