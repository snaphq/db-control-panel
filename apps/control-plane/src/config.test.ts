import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const DATABASE_URL = 'postgresql://cp:secret@localhost:5432/control_plane';

describe('loadConfig', () => {
  it('parses api mode and defaults the port to 8080', () => {
    const config = loadConfig({
      ALLOYDB_MODE: 'api',
      DATABASE_URL,
      ALLOYDB_API_TOKEN: 'token',
    });
    expect(config).toEqual({
      mode: 'api',
      databaseUrl: DATABASE_URL,
      port: 8080,
      apiToken: 'token',
      libsqlJwtSigningKeyPath: undefined,
    });
  });

  it('parses worker mode with every Neon and libSQL key', () => {
    const config = loadConfig({
      ALLOYDB_MODE: 'worker',
      DATABASE_URL,
      PORT: '9000',
      STORAGE_CONTROLLER_URL: 'http://storage-controller.neon:1234',
      NEON_JWT_PRIVATE_KEY_PATH: '/etc/neon/private.pem',
      CONTROL_PLANE_JWT_TOKEN: 'cp-token',
      LIBSQL_JWT_SIGNING_KEY_PATH: '/etc/libsql/private.pem',
      LIBSQL_ADMIN_AUTH_KEY: 'admin',
    });
    expect(config.mode).toBe('worker');
    expect(config.port).toBe(9000);
  });

  it('names a missing key', () => {
    expect(() =>
      loadConfig({ ALLOYDB_MODE: 'neon-glue', DATABASE_URL }),
    ).toThrowError(/STORAGE_CONTROLLER_URL is required/);
  });

  it('names every missing key at once', () => {
    try {
      loadConfig({ ALLOYDB_MODE: 'neon-glue' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      for (const key of [
        'DATABASE_URL',
        'STORAGE_CONTROLLER_URL',
        'NEON_JWT_PRIVATE_KEY_PATH',
        'CONTROL_PLANE_JWT_TOKEN',
        'NEON_PROXY_TO_CONTROLPLANE_TOKEN',
      ]) {
        expect(message).toContain(key);
      }
    }
  });

  it('treats an empty value as missing', () => {
    expect(() =>
      loadConfig({ ALLOYDB_MODE: 'api', DATABASE_URL, ALLOYDB_API_TOKEN: ' ' }),
    ).toThrowError(/ALLOYDB_API_TOKEN is required/);
  });

  it('rejects a missing or unknown mode', () => {
    expect(() => loadConfig({})).toThrowError(/ALLOYDB_MODE is required/);
    expect(() => loadConfig({ ALLOYDB_MODE: 'cron' })).toThrowError(
      /ALLOYDB_MODE=cron is not valid/,
    );
  });

  it('rejects a DATABASE_URL that is not a Postgres URL', () => {
    expect(() =>
      loadConfig({
        ALLOYDB_MODE: 'api',
        DATABASE_URL: 'mysql://localhost/db',
        ALLOYDB_API_TOKEN: 'token',
      }),
    ).toThrowError(/DATABASE_URL must start with postgres/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() =>
      loadConfig({
        ALLOYDB_MODE: 'api',
        DATABASE_URL,
        ALLOYDB_API_TOKEN: 'token',
        PORT: '70000',
      }),
    ).toThrowError(/PORT/);
  });
});
