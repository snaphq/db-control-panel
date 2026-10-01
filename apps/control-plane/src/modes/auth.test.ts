import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { bearerAuth, safeEqual } from './auth.js';

describe('safeEqual', () => {
  it('compares strings of any length', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'secreT')).toBe(false);
    expect(safeEqual('short', 'a-much-longer-token')).toBe(false);
    expect(safeEqual('', 'secret')).toBe(false);
  });
});

describe('bearerAuth', () => {
  const app = new Hono();
  app.use('*', bearerAuth('s3cret'));
  app.get('/ping', (c) => c.text('pong'));

  const call = (authorization?: string) =>
    app.request('/ping', {
      headers: authorization ? { authorization } : {},
    });

  it('lets the right token through', async () => {
    const response = await call('Bearer s3cret');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pong');
  });

  it('accepts the scheme in any case', async () => {
    expect((await call('bearer s3cret')).status).toBe(200);
  });

  it('rejects a missing, wrong, or malformed token with 401', async () => {
    for (const header of [
      undefined,
      'Bearer wrong',
      'Bearer ',
      'Basic s3cret',
      's3cret',
    ]) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
    }
  });
});
