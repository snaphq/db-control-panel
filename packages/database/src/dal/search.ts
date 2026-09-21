import type { SearchQualifier, SearchQuery, SearchWarning } from "@repo/search";
import { type SQLWrapper, and, count, eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  type Organization,
  type Project,
  type User,
  organization,
  project,
  user,
} from "../schema";

const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

export interface SearchPage<T> {
  count: number;
  results: T[];
  warnings: SearchWarning[];
}

export type ProjectSearchResult = SearchPage<Project>;
export type OrganizationSearchResult = SearchPage<Organization>;

export type AdminSearchUser = Pick<
  User,
  | "archivedAt"
  | "createdAt"
  | "emailVerified"
  | "id"
  | "name"
  | "publicEmail"
  | "role"
  | "tenantId"
  | "username"
>;

export type UserSearchResult = SearchPage<AdminSearchUser>;

export interface SearchPageOptions {
  limit?: number;
  offset?: number;
  query: SearchQuery;
}

function pageBounds(options: SearchPageOptions): {
  limit: number;
  offset: number;
} {
  return {
    limit: Math.min(MAX_LIMIT, Math.max(1, options.limit ?? 50)),
    offset: Math.min(MAX_OFFSET, Math.max(0, options.offset ?? 0)),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&").slice(0, 256);
}

function contains(column: SQLWrapper, value: string): ReturnType<typeof sql> {
  return sql`COALESCE(${column}, '') ILIKE ${`%${escapeLike(value)}%`} ESCAPE '\\'`;
}

function warning(
  code: "unsupported_value",
  message: string,
  token: string,
): SearchWarning {
  return { code, message, token };
}

function qualifierGroups(
  query: SearchQuery,
  key: SearchQualifier["key"],
): { positive: SearchQualifier[]; negative: SearchQualifier[] } {
  const qualifiers = query.qualifiers.filter((item) => item.key === key);
  return {
    positive: qualifiers.filter((item) => !item.negated),
    negative: qualifiers.filter((item) => item.negated),
  };
}

function addTextConditions(
  conditions: ReturnType<typeof sql>[],
  query: SearchQuery,
  fields: SQLWrapper[],
): void {
  for (const term of query.terms) {
    const matches = fields.map((field) => contains(field, term.value));
    const match = or(...matches);
    if (match) {
      conditions.push(term.negated ? sql`NOT (${match})` : match);
    }
  }
}

function addFieldConditions(
  conditions: ReturnType<typeof sql>[],
  query: SearchQuery,
  key: "description" | "email" | "name" | "slug" | "status",
  field: SQLWrapper,
): void {
  const groups = qualifierGroups(query, key);
  if (groups.positive.length > 0) {
    const match = or(
      ...groups.positive.map((item) => contains(field, item.value)),
    );
    if (match) conditions.push(match);
  }
  for (const item of groups.negative) {
    conditions.push(sql`NOT (${contains(field, item.value)})`);
  }
}

function addTypeCondition(
  conditions: ReturnType<typeof sql>[],
  warnings: SearchWarning[],
  query: SearchQuery,
  entity: "organization" | "project" | "user",
): void {
  for (const item of query.qualifiers.filter(
    (qualifier) => qualifier.key === "type",
  )) {
    const value = item.value.toLowerCase();
    if (value !== entity) {
      conditions.push(sql`FALSE`);
      warnings.push(
        warning(
          "unsupported_value",
          `type:${item.value} does not match this search surface.`,
          `type:${item.value}`,
        ),
      );
    } else if (item.negated) {
      conditions.push(sql`FALSE`);
      warnings.push(
        warning(
          "unsupported_value",
          `-${entity} excludes every result on this search surface.`,
          `-type:${item.value}`,
        ),
      );
    }
  }
}

function addUnsupportedQualifiers(
  warnings: SearchWarning[],
  query: SearchQuery,
  supported: ReadonlySet<SearchQualifier["key"]>,
): void {
  for (const item of query.qualifiers) {
    if (supported.has(item.key)) continue;
    warnings.push(
      warning(
        "unsupported_value",
        `The ${item.key}: qualifier is not supported for this search surface.`,
        `${item.key}:${item.value}`,
      ),
    );
  }
}

function projectConditions(
  tenantId: string,
  organizationId: string | null,
  query: SearchQuery,
): { conditions: ReturnType<typeof sql>[]; warnings: SearchWarning[] } {
  const conditions: ReturnType<typeof sql>[] = [eq(project.tenantId, tenantId)];
  if (organizationId !== null) {
    conditions.push(eq(project.organizationId, organizationId));
  }
  const warnings = [...query.warnings];
  addTextConditions(conditions, query, [
    project.name,
    project.slug,
    project.description,
  ]);
  addFieldConditions(conditions, query, "name", project.name);
  addFieldConditions(conditions, query, "slug", project.slug);
  addFieldConditions(conditions, query, "description", project.description);
  addTypeCondition(conditions, warnings, query, "project");
  addUnsupportedQualifiers(
    warnings,
    query,
    new Set(["description", "name", "slug", "type"]),
  );
  return { conditions, warnings };
}

export async function searchProjects(
  tenantId: string,
  organizationId: string | null,
  options: SearchPageOptions,
): Promise<ProjectSearchResult> {
  const { limit, offset } = pageBounds(options);
  const { conditions, warnings } = projectConditions(
    tenantId,
    organizationId,
    options.query,
  );
  const where = and(...conditions);
  const rows = await db()
    .select()
    .from(project)
    .where(where)
    .orderBy(sql`${project.name} ASC`, sql`${project.id} ASC`)
    .limit(limit)
    .offset(offset);
  const [total] = await db()
    .select({ count: count() })
    .from(project)
    .where(where);
  return { results: rows, count: Number(total?.count ?? 0), warnings };
}

function organizationConditions(
  tenantId: string | null,
  query: SearchQuery,
): { conditions: ReturnType<typeof sql>[]; warnings: SearchWarning[] } {
  const conditions: ReturnType<typeof sql>[] = [];
  if (tenantId !== null) conditions.push(eq(organization.tenantId, tenantId));
  const warnings = [...query.warnings];
  addTextConditions(conditions, query, [organization.name, organization.slug]);
  addFieldConditions(conditions, query, "name", organization.name);
  addFieldConditions(conditions, query, "slug", organization.slug);
  addFieldConditions(conditions, query, "status", organization.status);
  addTypeCondition(conditions, warnings, query, "organization");
  addUnsupportedQualifiers(
    warnings,
    query,
    new Set(["name", "slug", "status", "type"]),
  );
  return { conditions, warnings };
}

export async function searchOrganizations(
  tenantId: string | null,
  options: SearchPageOptions,
): Promise<OrganizationSearchResult> {
  const { limit, offset } = pageBounds(options);
  const { conditions, warnings } = organizationConditions(
    tenantId,
    options.query,
  );
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db()
    .select()
    .from(organization)
    .where(where)
    .orderBy(sql`${organization.name} ASC`, sql`${organization.id} ASC`)
    .limit(limit)
    .offset(offset);
  const [total] = await db()
    .select({ count: count() })
    .from(organization)
    .where(where);
  return { results: rows, count: Number(total?.count ?? 0), warnings };
}

function userConditions(
  tenantId: string,
  query: SearchQuery,
): { conditions: ReturnType<typeof sql>[]; warnings: SearchWarning[] } {
  const conditions: ReturnType<typeof sql>[] = [eq(user.tenantId, tenantId)];
  const warnings = [...query.warnings];
  addTextConditions(conditions, query, [
    user.name,
    user.publicEmail,
    user.username,
  ]);
  addFieldConditions(conditions, query, "name", user.name);
  addFieldConditions(conditions, query, "email", user.publicEmail);
  addFieldConditions(conditions, query, "status", user.role);
  addTypeCondition(conditions, warnings, query, "user");

  const archived = qualifierGroups(query, "archived");
  const archivedCondition = (value: boolean) =>
    value
      ? sql`${user.archivedAt} IS NOT NULL`
      : sql`${user.archivedAt} IS NULL`;
  const positiveArchived: ReturnType<typeof sql>[] = [];
  for (const item of [...archived.positive, ...archived.negative]) {
    const value = item.value.toLowerCase();
    if (value !== "true" && value !== "false") {
      warnings.push(
        warning(
          "unsupported_value",
          "archived: accepts only true or false.",
          `archived:${item.value}`,
        ),
      );
      continue;
    }
    const archivedValue = value === "true";
    const wantsArchived = item.negated ? !archivedValue : archivedValue;
    if (item.negated) {
      conditions.push(archivedCondition(wantsArchived));
    } else {
      positiveArchived.push(archivedCondition(wantsArchived));
    }
  }
  if (positiveArchived.length > 0) {
    const match = or(...positiveArchived);
    if (match) conditions.push(match);
  }

  addUnsupportedQualifiers(
    warnings,
    query,
    new Set(["archived", "email", "name", "status", "type"]),
  );
  return { conditions, warnings };
}

export async function searchUsers(
  tenantId: string,
  options: SearchPageOptions,
): Promise<UserSearchResult> {
  const { limit, offset } = pageBounds(options);
  const { conditions, warnings } = userConditions(tenantId, options.query);
  const where = and(...conditions);
  const rows = await db()
    .select({
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      publicEmail: user.publicEmail,
      username: user.username,
      emailVerified: user.emailVerified,
      role: user.role,
      archivedAt: user.archivedAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(where)
    .orderBy(sql`${user.name} ASC`, sql`${user.id} ASC`)
    .limit(limit)
    .offset(offset);
  const [total] = await db().select({ count: count() }).from(user).where(where);
  return { results: rows, count: Number(total?.count ?? 0), warnings };
}
