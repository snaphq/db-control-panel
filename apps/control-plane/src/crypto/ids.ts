import { randomBytes, randomInt } from 'node:crypto';

/** Prefixes of ids the control plane generates. Endpoints use their own `ep-` format. */
export const ID_PREFIXES = {
  project: 'proj',
  branch: 'br',
  role: 'role',
  database: 'db',
  libsqlDatabase: 'ldb',
  operation: 'op',
  usageEvent: 'use',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
/** Largest multiple of 36 below 256; bytes at or above it are redrawn to avoid modulo bias. */
const BASE36_LIMIT = 252;

/** `length` lowercase base36 characters from a CSPRNG, without modulo bias. */
export function randomBase36(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= BASE36_LIMIT) continue;
      out += BASE36[byte % 36];
      if (out.length === length) break;
    }
  }
  return out;
}

/** `<prefix>_<20 base36 chars>`, about 103 bits of randomness. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBase36(20)}`;
}

/** 32 lowercase hex characters, the form Neon requires for tenant and timeline ids. */
export function newNeonId(): string {
  return randomBytes(16).toString('hex');
}

const NEON_ID_PATTERN = /^[0-9a-f]{32}$/;

export function isNeonId(value: string): boolean {
  return NEON_ID_PATTERN.test(value);
}

const ADJECTIVES = [
  'amber',
  'ancient',
  'autumn',
  'billowing',
  'bold',
  'brave',
  'bright',
  'broad',
  'calm',
  'cool',
  'crimson',
  'damp',
  'dark',
  'dawn',
  'dry',
  'eager',
  'early',
  'empty',
  'falling',
  'fancy',
  'floral',
  'fragrant',
  'frosty',
  'gentle',
  'green',
  'hidden',
  'holy',
  'icy',
  'jolly',
  'late',
  'lingering',
  'little',
  'lively',
  'long',
  'lucky',
  'misty',
  'morning',
  'muddy',
  'nameless',
  'noisy',
  'odd',
  'old',
  'orange',
  'patient',
  'plain',
  'polished',
  'proud',
  'purple',
  'quiet',
  'rapid',
  'red',
  'restless',
  'rough',
  'round',
  'royal',
  'shiny',
  'shy',
  'silent',
  'small',
  'snowy',
  'soft',
  'solitary',
  'sparkling',
  'spring',
  'still',
  'summer',
  'sweet',
  'twilight',
  'wandering',
  'weathered',
  'white',
  'wild',
  'winter',
  'wispy',
  'withered',
  'young',
] as const;

const NOUNS = [
  'bird',
  'breeze',
  'brook',
  'bush',
  'butterfly',
  'cell',
  'cherry',
  'cloud',
  'darkness',
  'dawn',
  'dew',
  'dream',
  'dust',
  'feather',
  'field',
  'fire',
  'firefly',
  'flower',
  'fog',
  'forest',
  'frog',
  'frost',
  'glade',
  'glitter',
  'grass',
  'haze',
  'hill',
  'lake',
  'leaf',
  'meadow',
  'moon',
  'morning',
  'mountain',
  'night',
  'paper',
  'pine',
  'pond',
  'rain',
  'resonance',
  'river',
  'sea',
  'shadow',
  'shape',
  'silence',
  'sky',
  'smoke',
  'snow',
  'snowflake',
  'sound',
  'star',
  'sun',
  'sunset',
  'surf',
  'thunder',
  'tree',
  'violet',
  'voice',
  'water',
  'waterfall',
  'wave',
  'wildflower',
  'wind',
  'wood',
  'zebra',
] as const;

/** `ep-<adjective>-<noun>-<8 base36>`: a valid DNS label, as the Neon proxy takes it from the SNI. */
export function newEndpointId(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  return `ep-${adjective}-${noun}-${randomBase36(8)}`;
}

const ENDPOINT_ID_PATTERN = /^ep-[a-z]+-[a-z]+-[0-9a-z]{8}$/;

export function isEndpointId(value: string): boolean {
  return ENDPOINT_ID_PATTERN.test(value);
}
