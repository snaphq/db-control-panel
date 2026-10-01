import { describe, expect, it } from 'vitest';
import {
  BootstrapError,
  bootstrapDataApi,
  bootstrapStatements,
  quoteLiteral,
} from './bootstrap.js';
import { createFakeSql } from './fakes.js';

const SECRET = 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy';

describe('quoteLiteral', () => {
  it('doubles single quotes and leaves backslashes alone', () => {
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral('a\\b')).toBe("'a\\b'");
    expect(quoteLiteral('')).toBe("''");
  });
});

describe('bootstrapStatements', () => {
  const all = () => bootstrapStatements({ authenticatorScramSecret: SECRET });
  const sqlOf = (name: string) => all().find((s) => s.name === name)?.sql ?? '';

  it('creates authenticator with LOGIN NOINHERIT and the SCRAM secret, never a plaintext password', () => {
    const sql = sqlOf('authenticator role');
    expect(sql).toContain(
      `CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${SECRET}'`,
    );
    expect(sql).toContain('ALTER ROLE authenticator PASSWORD');
    expect(sql).toContain('EXCEPTION WHEN insufficient_privilege');
    expect(sql).not.toMatch(/SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB/);
  });

  it('creates anonymous and authenticated as NOLOGIN without extra attributes', () => {
    for (const role of ['anonymous', 'authenticated']) {
      const sql = sqlOf(`${role} role`);
      expect(sql).toContain(`CREATE ROLE ${role} NOLOGIN;`);
      expect(sql).toContain(`rolname = '${role}'`);
      expect(sql).not.toMatch(/BYPASSRLS|SUPERUSER/);
    }
  });

  it('grants both roles to authenticator only when it is not yet a member', () => {
    for (const role of ['anonymous', 'authenticated']) {
      const sql = sqlOf(`${role} membership`);
      expect(sql).toContain(
        `pg_has_role('authenticator', '${role}', 'MEMBER')`,
      );
      expect(sql).toContain(`GRANT ${role} TO authenticator`);
    }
  });

  it('gives anonymous only schema usage and authenticated full access, now and by default', () => {
    expect(sqlOf('schema usage')).toBe(
      'GRANT USAGE ON SCHEMA public TO anonymous, authenticated',
    );
    const joined = all()
      .map((s) => s.sql)
      .join(';\n');
    expect(joined).not.toMatch(/ON ALL \w+ IN SCHEMA public TO anonymous/);
    expect(joined).not.toMatch(/GRANT ALL ON \w+ TO anonymous/);
    for (const kind of ['TABLES', 'SEQUENCES', 'ROUTINES']) {
      expect(joined).toContain(
        `GRANT ALL ON ALL ${kind} IN SCHEMA public TO authenticated`,
      );
      expect(joined).toContain(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ${kind} TO authenticated`,
      );
    }
  });

  it('flags only the event-trigger statements as privilege-sensitive', () => {
    expect(
      all()
        .filter((s) => s.needsEventTriggerPrivilege)
        .map((s) => s.name),
    ).toEqual(['ddl watch trigger', 'drop watch trigger']);
  });

  it('ends by asking PostgREST to reload its schema cache', () => {
    expect(all().at(-1)?.sql).toBe("NOTIFY pgrst, 'reload schema'");
  });

  it('puts the secret in as an escaped literal', () => {
    const odd = bootstrapStatements({ authenticatorScramSecret: "a'b" });
    expect(odd[0]?.sql).toContain("PASSWORD 'a''b'");
  });
});

describe('bootstrapDataApi', () => {
  async function run(
    configure?: (fake: ReturnType<typeof createFakeSql>) => void,
  ) {
    const sql = createFakeSql();
    configure?.(sql);
    const session = await sql.connect({
      host: 'h',
      port: 5432,
      database: 'd',
      user: 'u',
      password: 'p',
    });
    const result = await bootstrapDataApi(session, {
      authenticatorScramSecret: SECRET,
    }).catch((error: unknown) => error);
    return { result, statements: sql.sessions[0]?.statements ?? [] };
  }

  it('runs every statement in order and reports event-trigger reloads', async () => {
    const { result, statements } = await run();
    expect(result).toEqual({ schemaReload: 'event-trigger' });
    expect(statements).toEqual(
      bootstrapStatements({ authenticatorScramSecret: SECRET }).map(
        (s) => s.sql,
      ),
    );
  });

  it('falls back to manual reloads when the owner cannot create event triggers', async () => {
    const { result, statements } = await run((sql) => {
      sql.failStatement = { match: /CREATE EVENT TRIGGER/, code: '42501' };
    });
    expect(result).toEqual({ schemaReload: 'manual' });
    // Everything else, including the final NOTIFY, still ran.
    expect(statements.at(-1)).toBe("NOTIFY pgrst, 'reload schema'");
    expect(
      statements.some((s) => s.includes('GRANT USAGE ON SCHEMA public')),
    ).toBe(true);
  });

  it('does not hide other errors on the trigger statements', async () => {
    const { result } = await run((sql) => {
      sql.failStatement = { match: /CREATE EVENT TRIGGER/, code: '42P01' };
    });
    expect(result).toBeInstanceOf(BootstrapError);
  });

  it('names the statement that failed and keeps the SQLSTATE', async () => {
    const { result, statements } = await run((sql) => {
      sql.failStatement = {
        match: /GRANT USAGE ON SCHEMA public/,
        code: '42501',
        message: 'permission denied for schema public',
      };
    });
    expect(result).toMatchObject({
      name: 'BootstrapError',
      statement: 'schema usage',
      code: '42501',
      message: expect.stringContaining('permission denied for schema public'),
    });
    // Stops at the failure: nothing after it ran.
    expect(statements.some((s) => s.includes('DEFAULT PRIVILEGES'))).toBe(
      false,
    );
  });
});
