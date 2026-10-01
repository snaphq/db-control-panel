import { describe, expect, it } from 'vitest';
import {
  corsHeaders,
  endpointFromHost,
  forwardableHeaders,
  isPreflight,
  parseGatewayTarget,
  preflightHeaders,
} from './gateway-routing.js';

const SUFFIX = 'apirest.alloydb.net';
const HOST = 'ep-calm-moon-abcd1234.apirest.alloydb.net';

describe('endpointFromHost', () => {
  it('takes the endpoint id from the first label', () => {
    expect(endpointFromHost(HOST, SUFFIX)).toBe('ep-calm-moon-abcd1234');
    expect(endpointFromHost(`${HOST}:443`, SUFFIX)).toBe(
      'ep-calm-moon-abcd1234',
    );
    expect(endpointFromHost(HOST.toUpperCase(), SUFFIX)).toBe(
      'ep-calm-moon-abcd1234',
    );
  });

  it.each([
    undefined,
    '',
    'apirest.alloydb.net',
    'ep-calm-moon-abcd1234.pg.alloydb.net',
    'not-an-endpoint.apirest.alloydb.net',
    'x.ep-calm-moon-abcd1234.apirest.alloydb.net',
    'ep-calm-moon-abcd1234.apirest.alloydb.net.evil.test',
    'ep-calm-moon-abcd1234-pooler.apirest.alloydb.net',
  ])('rejects %s', (host) => {
    expect(endpointFromHost(host, SUFFIX)).toBeNull();
  });
});

describe('parseGatewayTarget', () => {
  it('splits the database and the PostgREST path', () => {
    expect(parseGatewayTarget(HOST, '/neondb/rest/v1/todos', SUFFIX)).toEqual({
      endpointId: 'ep-calm-moon-abcd1234',
      database: 'neondb',
      restPath: '/todos',
    });
    expect(
      parseGatewayTarget(HOST, '/app_db/rest/v1/rpc/add', SUFFIX),
    ).toMatchObject({
      database: 'app_db',
      restPath: '/rpc/add',
    });
  });

  it('serves the OpenAPI root of PostgREST at /rest/v1 and /rest/v1/', () => {
    for (const path of ['/neondb/rest/v1', '/neondb/rest/v1/']) {
      expect(parseGatewayTarget(HOST, path, SUFFIX)).toMatchObject({
        restPath: '/',
      });
    }
  });

  it('keeps encoded segments after the prefix untouched', () => {
    expect(
      parseGatewayTarget(HOST, '/neondb/rest/v1/my%20table', SUFFIX),
    ).toMatchObject({ restPath: '/my%20table' });
  });

  it('answers "host" for a foreign host and "path" for anything else', () => {
    expect(parseGatewayTarget('example.com', '/neondb/rest/v1/t', SUFFIX)).toBe(
      'host',
    );
    for (const path of [
      '/',
      '/neondb',
      '/neondb/rest',
      '/neondb/rest/v2/t',
      '/neondb/rest/v1x/t',
      '/neondb/other/rest/v1/t',
      '/1bad/rest/v1/t',
      '/bad-name/rest/v1/t',
      '/%E0%A4%A/rest/v1/t',
      `/${'a'.repeat(64)}/rest/v1/t`,
    ]) {
      expect(parseGatewayTarget(HOST, path, SUFFIX)).toBe('path');
    }
  });
});

describe('forwardableHeaders', () => {
  it('drops hop-by-hop headers and those named by Connection, keeps the rest', () => {
    const out = forwardableHeaders(
      new Headers({
        authorization: 'Bearer t',
        'content-type': 'application/json',
        prefer: 'return=representation',
        connection: 'keep-alive, x-private',
        'keep-alive': 'timeout=5',
        'x-private': 'secret',
        'transfer-encoding': 'chunked',
        upgrade: 'websocket',
        host: 'ep-x.apirest.alloydb.net',
      }),
    );
    expect([...out.keys()].sort()).toEqual([
      'authorization',
      'content-type',
      'prefer',
    ]);
  });

  it('sets the extra headers last', () => {
    const out = forwardableHeaders(new Headers({ 'accept-encoding': 'gzip' }), {
      'accept-encoding': 'identity',
    });
    expect(out.get('accept-encoding')).toBe('identity');
  });
});

describe('CORS', () => {
  it('adds nothing without an Origin', () => {
    expect(corsHeaders(new Headers())).toEqual({});
  });

  it('echoes the origin and exposes the headers PostgREST exposes', () => {
    const cors = corsHeaders(
      new Headers({ origin: 'https://app.example.com' }),
    );
    expect(cors['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(cors['Access-Control-Allow-Credentials']).toBe('true');
    expect(cors['Access-Control-Expose-Headers']).toContain('Content-Range');
  });

  it('recognises a preflight only with an origin and a requested method', () => {
    const headers = new Headers({
      origin: 'https://a.test',
      'access-control-request-method': 'POST',
    });
    expect(isPreflight('OPTIONS', headers)).toBe(true);
    expect(isPreflight('GET', headers)).toBe(false);
    expect(
      isPreflight('OPTIONS', new Headers({ origin: 'https://a.test' })),
    ).toBe(false);
  });

  it('answers a preflight like PostgREST: methods, requested headers and a day of caching', () => {
    const out = preflightHeaders(
      new Headers({
        origin: 'https://a.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-client-info, Prefer',
      }),
    );
    expect(out['Access-Control-Allow-Origin']).toBe('https://a.test');
    expect(out['Access-Control-Allow-Methods']).toBe(
      'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
    );
    expect(out['Access-Control-Allow-Headers']).toBe(
      'Authorization, Content-Type, Accept, Accept-Language, Content-Language, x-client-info, Prefer',
    );
    expect(out['Access-Control-Max-Age']).toBe('86400');
    expect(out).not.toHaveProperty('Access-Control-Expose-Headers');
  });
});
