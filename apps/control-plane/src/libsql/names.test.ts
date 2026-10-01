import { libsqlDatabaseNameSchema } from '@repo/control-plane-contract';
import { describe, expect, it } from 'vitest';
import {
  MAX_NAMESPACE_LENGTH,
  libsqlHostname,
  libsqlUrl,
  namespaceFor,
  namespaceProblem,
  teamSlug,
} from './names.js';

describe('teamSlug', () => {
  it('keeps a readable organization id', () => {
    expect(teamSlug('acme')).toBe('acme');
    expect(teamSlug('org-42')).toBe('org-42');
  });

  it('hashes ids that are not a short lowercase label', () => {
    for (const id of ['Acme', 'org_1', 'a.b', '-x', 'x-', '', 'o'.repeat(30)]) {
      expect(teamSlug(id)).toMatch(/^t[0-9a-f]{10}$/);
    }
  });

  it('keeps different organizations apart and is stable', () => {
    expect(teamSlug('Acme')).toBe(teamSlug('Acme'));
    expect(teamSlug('Acme')).not.toBe(teamSlug('ACME'));
    expect(teamSlug('Acme')).not.toBe(teamSlug('acme'));
  });
});

describe('namespaceFor', () => {
  it('joins the database and team names', () => {
    expect(namespaceFor('orders', 'acme')).toBe('orders-acme');
  });

  it('always fits one DNS label, even for the longest database name', () => {
    const longest = 'a'.repeat(42);
    const namespace = namespaceFor(longest, 'o'.repeat(20));
    expect(namespace.length).toBeLessThanOrEqual(MAX_NAMESPACE_LENGTH);
    expect(namespace).toMatch(/^[a-z0-9-]+$/);
    expect(namespaceFor(longest, 'Weird_Org!').length).toBeLessThanOrEqual(
      MAX_NAMESPACE_LENGTH,
    );
  });

  it('accepts every name the contract accepts', () => {
    for (const name of ['a', 'a-b', 'a'.repeat(42), '0db', 'db0']) {
      expect(libsqlDatabaseNameSchema.safeParse(name).success).toBe(true);
      expect(namespaceProblem(namespaceFor(name, 'org'))).toBeNull();
    }
  });
});

describe('namespaceProblem', () => {
  it.each([
    ['', 'empty'],
    ['Upper', 'uppercase'],
    ['has.dot', 'a dot would end the Host label early'],
    ['has_underscore', 'underscore'],
    ['-lead', 'leading hyphen'],
    ['trail-', 'trailing hyphen'],
    ['a'.repeat(64), 'too long'],
    ['default', 'sqld default namespace'],
  ])('rejects %j (%s)', (value) => {
    expect(namespaceProblem(value)).not.toBeNull();
  });
});

describe('public names', () => {
  it('builds the host and libsql URL', () => {
    expect(libsqlHostname('orders-acme', 'lite.alloydb.net')).toBe(
      'orders-acme.lite.alloydb.net',
    );
    expect(libsqlUrl('orders-acme', 'lite.alloydb.net')).toBe(
      'libsql://orders-acme.lite.alloydb.net',
    );
  });
});
