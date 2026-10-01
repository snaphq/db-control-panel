import { describe, expect, it } from "vitest";
import {
  COMPUTE_SIZES,
  OPERATION_ACTIONS,
  createBranchRequestSchema,
  createDatabaseRequestSchema,
  createLibsqlTokenRequestSchema,
  createProjectRequestSchema,
  createProjectResponseSchema,
  createRoleRequestSchema,
  databaseSchema,
  errorResponseSchema,
  listOperationsQuerySchema,
  listOperationsResponseSchema,
  operationResponseSchema,
  updateEndpointRequestSchema,
} from "./index.js";

const now = "2026-01-01T00:00:00.000Z";
const operation = {
  id: "op_1",
  target_type: "project",
  target_id: "proj_1",
  action: "project.create",
  status: "scheduling",
  failures_count: 0,
  error: null,
  created_at: now,
  finished_at: null,
};

describe("operation list", () => {
  it("defaults to a page of 50 with no status filter", () => {
    expect(listOperationsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("accepts active or one status, and coerces the limit from a query string", () => {
    expect(
      listOperationsQuerySchema.parse({ status: "active", limit: "10" }),
    ).toEqual({ status: "active", limit: 10 });
    expect(listOperationsQuerySchema.parse({ status: "failed" }).status).toBe(
      "failed",
    );
  });

  it("refuses unknown statuses and out-of-range limits", () => {
    for (const query of [
      { status: "pending" },
      { status: "scheduling,running" },
      { limit: "0" },
      { limit: "101" },
      { limit: "ten" },
      { cursor: "" },
    ]) {
      expect(
        listOperationsQuerySchema.safeParse(query).success,
        String(query),
      ).toBe(false);
    }
  });

  it("parses a page with and without a next cursor", () => {
    expect(
      listOperationsResponseSchema.parse({
        operations: [operation],
        next_cursor: "op_1",
      }).next_cursor,
    ).toBe("op_1");
    expect(
      listOperationsResponseSchema.parse({ operations: [], next_cursor: null })
        .operations,
    ).toEqual([]);
  });
});

describe("operations", () => {
  it("parses the operation body the API returns", () => {
    expect(operationResponseSchema.parse({ operation }).operation.id).toBe(
      "op_1",
    );
  });

  it("rejects an unknown action", () => {
    expect(
      operationResponseSchema.safeParse({
        operation: { ...operation, action: "project.explode" },
      }).success,
    ).toBe(false);
  });

  it("lists every action once", () => {
    expect(new Set(OPERATION_ACTIONS).size).toBe(OPERATION_ACTIONS.length);
  });

  it("describes errors with a code and message", () => {
    expect(
      errorResponseSchema.safeParse({
        error: { code: "locked", message: "busy" },
      }).success,
    ).toBe(true);
    expect(errorResponseSchema.safeParse({ error: "busy" }).success).toBe(
      false,
    );
  });
});

describe("createProjectRequestSchema", () => {
  it("accepts a minimal body and trims the name", () => {
    expect(createProjectRequestSchema.parse({ name: "  demo " }).name).toBe(
      "demo",
    );
  });

  it("accepts IPs, CIDR blocks and ranges, and null for no restriction", () => {
    for (const allowed_ips of [
      ["203.0.113.7", "10.0.0.0/8", "10.0.0.1-10.0.0.9", "2001:db8::/32"],
      null,
    ]) {
      expect(
        createProjectRequestSchema.safeParse({ name: "p", allowed_ips })
          .success,
      ).toBe(true);
    }
  });

  it("rejects bad IP patterns, versions, sizes and timeouts", () => {
    const bad = [
      { name: "p", allowed_ips: ["not an ip"] },
      { name: "p", pg_version: 16 },
      { name: "p", compute_size: "3" },
      { name: "p", suspend_timeout_seconds: -1 },
      { name: "p", suspend_timeout_seconds: 604_801 },
      { name: "" },
    ];
    for (const body of bad) {
      expect(createProjectRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("knows the supported compute sizes", () => {
    expect(COMPUTE_SIZES).toContain("0.25");
  });
});

describe("branch, role and database requests", () => {
  it("validates LSNs", () => {
    expect(
      createBranchRequestSchema.safeParse({
        name: "b",
        parent_lsn: "0/16B5A50",
      }).success,
    ).toBe(true);
    expect(
      createBranchRequestSchema.safeParse({ name: "b", parent_lsn: "16B5A50" })
        .success,
    ).toBe(false);
  });

  it("refuses reserved role names", () => {
    for (const name of ["cloud_admin", "Postgres", "pg_monitor", "anonymous"]) {
      expect(createRoleRequestSchema.safeParse({ name }).success).toBe(false);
    }
    expect(
      createRoleRequestSchema.safeParse({ name: "app_user" }).success,
    ).toBe(true);
  });

  it("refuses identifiers that need quoting", () => {
    for (const name of ['a"b', "1abc", "a-b", "x".repeat(64)]) {
      expect(
        createDatabaseRequestSchema.safeParse({ name, owner_name: "app" })
          .success,
      ).toBe(false);
    }
  });

  it("requires something to change on an endpoint update", () => {
    expect(updateEndpointRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateEndpointRequestSchema.safeParse({ compute_size: "2" }).success,
    ).toBe(true);
  });
});

describe("libSQL tokens", () => {
  it("defaults to read-write", () => {
    expect(createLibsqlTokenRequestSchema.parse({}).access).toBe("read_write");
  });
});

describe("createProjectResponseSchema", () => {
  it("round-trips a full response", () => {
    const response = {
      project: {
        id: "proj_1",
        name: "demo",
        pg_version: 17,
        history_retention_seconds: 86_400,
        allowed_ips: null,
        created_at: now,
      },
      branch: {
        id: "br_1",
        project_id: "proj_1",
        name: "main",
        parent_id: null,
        parent_lsn: null,
        is_default: true,
        created_at: now,
      },
      endpoints: [
        {
          id: "ep-calm-moon-abcd1234",
          project_id: "proj_1",
          branch_id: "br_1",
          type: "read_write",
          compute_size: "1",
          suspend_timeout_seconds: 300,
          state: "idle",
          host: "ep-calm-moon-abcd1234.pg.alloydb.net",
          last_active_at: null,
          created_at: now,
        },
      ],
      roles: [
        {
          name: "neondb_owner",
          branch_id: "br_1",
          created_at: now,
          password: "pw",
        },
      ],
      databases: [
        {
          id: "db_1",
          branch_id: "br_1",
          name: "neondb",
          owner_name: "neondb_owner",
          data_api_enabled: false,
          data_api_url: null,
          created_at: now,
        },
      ],
      connection_uris: [{ connection_uri: "postgresql://u:p@h/neondb" }],
      operation,
    };
    expect(createProjectResponseSchema.parse(response)).toEqual(response);
  });
});

describe("databaseSchema", () => {
  const database = {
    id: "db_1",
    branch_id: "br_1",
    name: "neondb",
    owner_name: "neondb_owner",
    data_api_enabled: true,
    created_at: now,
  };

  it("carries the Data API URL, or null when there is none", () => {
    const url = "https://ep-a-1.apirest.alloydb.net/neondb/rest/v1";
    expect(
      databaseSchema.parse({ ...database, data_api_url: url }).data_api_url,
    ).toBe(url);
    expect(
      databaseSchema.parse({ ...database, data_api_url: null }).data_api_url,
    ).toBeNull();
  });

  it("requires data_api_url so a server that forgets it is caught", () => {
    expect(databaseSchema.safeParse(database).success).toBe(false);
  });
});
