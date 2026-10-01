import { describe, expect, it } from 'vitest';
import {
  ID_PREFIXES,
  isEndpointId,
  isNeonId,
  newEndpointId,
  newId,
  newNeonId,
  randomBase36,
} from './ids.js';

describe('ids', () => {
  it('generates prefixed ids with 20 base36 characters', () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      expect(newId(prefix)).toMatch(new RegExp(`^${prefix}_[0-9a-z]{20}$`));
    }
  });

  it('does not repeat ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('proj')));
    expect(ids.size).toBe(500);
  });

  it('generates 32-hex Neon ids', () => {
    const id = newNeonId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(isNeonId(id)).toBe(true);
    expect(isNeonId(id.toUpperCase())).toBe(false);
    expect(isNeonId(id.slice(1))).toBe(false);
  });

  it('generates endpoint ids that are valid DNS labels', () => {
    for (let index = 0; index < 200; index++) {
      const id = newEndpointId();
      expect(id).toMatch(/^ep-[a-z]+-[a-z]+-[0-9a-z]{8}$/);
      expect(isEndpointId(id)).toBe(true);
      expect(id.length).toBeLessThanOrEqual(63);
      expect(id.endsWith('-pooler')).toBe(false);
    }
  });

  it('rejects malformed endpoint ids', () => {
    expect(isEndpointId('ep-cool-darkness')).toBe(false);
    expect(isEndpointId('EP-cool-darkness-abcd1234')).toBe(false);
    expect(isEndpointId('ep-cool-darkness-abcd1234-pooler')).toBe(false);
  });

  it('covers the whole base36 alphabet', () => {
    const seen = new Set(randomBase36(4000));
    expect(seen.size).toBe(36);
  });
});
