import {
  connectionStrings,
  pooledHost,
} from "@repo/react-ui/components/databases/connection-urls";
import { describe, expect, it } from "vitest";

const endpoint = {
  id: "ep-quiet-lake-12",
  host: "ep-quiet-lake-12.pg.alloydb.net",
};

describe("connection strings", () => {
  it("adds -pooler to the first label only", () => {
    expect(pooledHost(endpoint.host)).toBe(
      "ep-quiet-lake-12-pooler.pg.alloydb.net",
    );
  });

  it("builds direct, pooled and SQL over HTTP strings with a password placeholder", () => {
    const urls = connectionStrings(endpoint, "neondb_owner", {
      name: "neondb",
      data_api_enabled: false,
    });
    expect(urls.direct).toBe(
      "postgresql://neondb_owner:<password>@ep-quiet-lake-12.pg.alloydb.net/neondb?sslmode=require",
    );
    expect(urls.pooled).toBe(
      "postgresql://neondb_owner:<password>@ep-quiet-lake-12-pooler.pg.alloydb.net/neondb?sslmode=require",
    );
    expect(urls.sqlOverHttp).toBe(
      "https://ep-quiet-lake-12.pg.alloydb.net/sql",
    );
  });

  it("offers the Data API URL only when it is enabled", () => {
    const off = connectionStrings(endpoint, "r", {
      name: "neondb",
      data_api_enabled: false,
    });
    const on = connectionStrings(endpoint, "r", {
      name: "neondb",
      data_api_enabled: true,
    });
    expect(off.dataApi).toBeNull();
    expect(on.dataApi).toBe(
      "https://ep-quiet-lake-12.apirest.alloydb.net/neondb/rest/v1",
    );
  });
});
