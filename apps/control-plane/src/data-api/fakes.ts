import type { SqlConnector, SqlTarget } from './bootstrap.js';

/** A connector that records what would have run, and can fail on demand. */
export interface FakeSql {
  connect: SqlConnector;
  sessions: { target: SqlTarget; statements: string[]; closed: boolean }[];
  /** Fails statements whose text matches, with this SQLSTATE; or `connect` itself. */
  failStatement: { match: RegExp; code?: string; message?: string } | null;
  failConnect: Error | null;
}

export function createFakeSql(): FakeSql {
  const fake: FakeSql = {
    sessions: [],
    failStatement: null,
    failConnect: null,
    async connect(target) {
      if (fake.failConnect) throw fake.failConnect;
      const session = { target, statements: [] as string[], closed: false };
      fake.sessions.push(session);
      return {
        async run(statement) {
          const failure = fake.failStatement;
          if (failure?.match.test(statement)) {
            throw Object.assign(
              new Error(failure.message ?? 'scripted failure'),
              {
                code: failure.code,
              },
            );
          }
          session.statements.push(statement);
        },
        async close() {
          session.closed = true;
        },
      };
    },
  };
  return fake;
}
