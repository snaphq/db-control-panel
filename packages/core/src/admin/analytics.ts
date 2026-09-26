import type {
  SeriesPoint,
  SeriesResult,
  SnapshotItem,
  TopOrgItem,
} from "@repo/analytics";
import {
  type RangeKey,
  bucketUnit,
  rangeDays,
} from "@repo/analytics/admin-range";
import { db, sql } from "@repo/database";
export type {
  SeriesPoint,
  SeriesResult,
  SnapshotItem,
  TopOrgItem,
} from "@repo/analytics";

/**
 * Build a dense time series by left-joining a generated date axis to a value
 * source query. The valueSql must select two columns named `bucket` (timestamp
 * truncated to the same unit) and `v` (numeric, default 0).
 *
 * Returns the series, the sum across the range, and the sum across the
 * previous equal-length range for delta KPIs.
 */
async function buildSeries(params: {
  range: RangeKey;
  organizationId?: string;
  /** Builds the inner aggregation. Must yield columns `bucket`, `v`. */
  buildInner: (
    fromTs: string,
    toTs: string,
    unit: "day" | "week",
    organizationId?: string,
  ) => ReturnType<typeof sql>;
}): Promise<SeriesResult> {
  const days = rangeDays(params.range);
  const unit = bucketUnit(params.range);
  const fromTs = `now() - ${days} * interval '1 ${unit}'`;
  const prevFromTs = `now() - ${days * 2} * interval '1 ${unit}'`;
  const prevToTs = `now() - ${days} * interval '1 ${unit}'`;

  const innerCurrent = params.buildInner(
    fromTs,
    "now()",
    unit,
    params.organizationId,
  );

  const result = await db().execute(sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${unit}, ${sql.raw(fromTs)}),
        date_trunc(${unit}, now()),
        interval '1 ${sql.raw(unit)}'
      )::date AS d
    ),
    src AS (${innerCurrent})
    SELECT to_char(buckets.d, 'YYYY-MM-DD') AS date,
           COALESCE(src.v, 0)::float AS value
    FROM buckets
    LEFT JOIN src ON date_trunc(${unit}, src.bucket) = buckets.d
    ORDER BY buckets.d ASC
  `);

  const series: SeriesPoint[] = result.rows.map((r) => ({
    date: r.date as string,
    value: Number(r.value ?? 0),
  }));

  const total = series.reduce((acc, p) => acc + p.value, 0);

  // Compute previous-period total
  const innerPrev = params.buildInner(
    prevFromTs,
    prevToTs,
    unit,
    params.organizationId,
  );
  const prevResult = await db().execute(sql`
    WITH src AS (${innerPrev})
    SELECT COALESCE(SUM(v), 0)::float AS total FROM src
  `);
  const prevTotal = Number(prevResult.rows[0]?.total ?? 0);

  return { series, total, prevTotal, rangeDays: days, bucket: unit };
}

// ---------------------------------------------------------------------------
// Series builders
// ---------------------------------------------------------------------------

export function getSignupsSeries(
  range: RangeKey,
  organizationId?: string,
): Promise<SeriesResult> {
  return buildSeries({
    range,
    organizationId,
    buildInner: (from, to, unit, orgId) => {
      if (orgId) {
        return sql`
          SELECT date_trunc(${unit}, m.created_at) AS bucket,
                 count(*)::float AS v
          FROM member m
          WHERE m.organization_id = ${orgId}
            AND m.created_at >= ${sql.raw(from)}
            AND m.created_at <  ${sql.raw(to)}
          GROUP BY bucket
        `;
      }
      return sql`
        SELECT date_trunc(${unit}, u.created_at) AS bucket,
               count(*)::float AS v
        FROM "user" u
        WHERE u.created_at >= ${sql.raw(from)}
          AND u.created_at <  ${sql.raw(to)}
        GROUP BY bucket
      `;
    },
  });
}

export function getRevenueSeries(
  range: RangeKey,
  organizationId?: string,
): Promise<SeriesResult> {
  return buildSeries({
    range,
    organizationId,
    buildInner: (from, to, unit, orgId) => {
      if (orgId) {
        return sql`
          WITH first_member AS (
            SELECT DISTINCT ON (m.user_id)
              m.user_id, m.organization_id
            FROM member m
            ORDER BY m.user_id, m.created_at ASC
          )
          SELECT date_trunc(${unit}, p.created_time) AS bucket,
                 SUM(p.amount::numeric)::float AS v
          FROM payments p
          JOIN "user" u ON u.email = p.email
          JOIN first_member fm ON fm.user_id = u.id
          WHERE fm.organization_id = ${orgId}
            AND p.created_time >= ${sql.raw(from)}
            AND p.created_time <  ${sql.raw(to)}
          GROUP BY bucket
        `;
      }
      return sql`
        SELECT date_trunc(${unit}, p.created_time) AS bucket,
               SUM(p.amount::numeric)::float AS v
        FROM payments p
        WHERE p.created_time >= ${sql.raw(from)}
          AND p.created_time <  ${sql.raw(to)}
        GROUP BY bucket
      `;
    },
  });
}

export function getWorkspacesSeries(range: RangeKey): Promise<SeriesResult> {
  return buildSeries({
    range,
    buildInner: (from, to, unit) => sql`
      SELECT date_trunc(${unit}, o.created_at) AS bucket,
             count(*)::float AS v
      FROM organization o
      WHERE o.created_at >= ${sql.raw(from)}
        AND o.created_at <  ${sql.raw(to)}
      GROUP BY bucket
    `,
  });
}

export function getSessionsSeries(
  range: RangeKey,
  organizationId?: string,
): Promise<SeriesResult> {
  return buildSeries({
    range,
    organizationId,
    buildInner: (from, to, unit, orgId) => {
      if (orgId) {
        return sql`
          SELECT date_trunc(${unit}, s.created_at) AS bucket,
                 count(DISTINCT s.user_id)::float AS v
          FROM session s
          JOIN member m ON m.user_id = s.user_id
          WHERE m.organization_id = ${orgId}
            AND s.created_at >= ${sql.raw(from)}
            AND s.created_at <  ${sql.raw(to)}
          GROUP BY bucket
        `;
      }
      return sql`
        SELECT date_trunc(${unit}, s.created_at) AS bucket,
               count(DISTINCT s.user_id)::float AS v
        FROM session s
        WHERE s.created_at >= ${sql.raw(from)}
          AND s.created_at <  ${sql.raw(to)}
        GROUP BY bucket
      `;
    },
  });
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function getOrgStatusBreakdown(): Promise<{
  items: SnapshotItem[];
  total: number;
}> {
  const result = await db().execute(sql`
    SELECT status AS label, count(*)::int AS value
    FROM organization
    GROUP BY status
    ORDER BY value DESC
  `);
  const items: SnapshotItem[] = result.rows.map((r) => ({
    label: String(r.label),
    value: Number(r.value),
  }));
  const total = items.reduce((acc, i) => acc + i.value, 0);
  return { items, total };
}

export async function getPlanDistribution(): Promise<{
  items: SnapshotItem[];
  total: number;
}> {
  const result = await db().execute(sql`
    SELECT COALESCE(pt.display_name, COALESCE(ob.plan_tier, 'free')) AS label,
           count(*)::int AS value
    FROM organization o
    LEFT JOIN org_billing ob ON ob.organization_id = o.id
    LEFT JOIN plan_tier pt ON pt.key = ob.plan_tier
    GROUP BY label
    ORDER BY value DESC
  `);
  const items: SnapshotItem[] = result.rows.map((r) => ({
    label: String(r.label ?? "free"),
    value: Number(r.value),
  }));
  const total = items.reduce((acc, i) => acc + i.value, 0);
  return { items, total };
}

/**
 * Top organizations by revenue. Payments are attributed to the organization
 * the paying user joined first (deterministic when a user belongs to multiple
 * orgs).
 */
export async function getTopOrgsByRevenue(
  range: RangeKey,
  limit = 10,
): Promise<{ items: TopOrgItem[] }> {
  const days = rangeDays(range);
  const result = await db().execute(sql`
    WITH first_member AS (
      SELECT DISTINCT ON (m.user_id)
        m.user_id, m.organization_id
      FROM member m
      ORDER BY m.user_id, m.created_at ASC
    )
    SELECT o.id AS organization_id,
           o.name AS name,
           o.slug AS slug,
           SUM(p.amount::numeric)::float AS revenue
    FROM payments p
    JOIN "user" u ON u.email = p.email
    JOIN first_member fm ON fm.user_id = u.id
    JOIN organization o ON o.id = fm.organization_id
    WHERE p.created_time >= now() - ${days} * interval '1 day'
    GROUP BY o.id, o.name, o.slug
    ORDER BY revenue DESC
    LIMIT ${limit}
  `);
  const items: TopOrgItem[] = result.rows.map((r) => ({
    organizationId: String(r.organization_id),
    name: String(r.name),
    slug: String(r.slug),
    revenue: Number(r.revenue ?? 0),
  }));
  return { items };
}
