import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** Same defaults as PostgreSQL: SCRAM_DEFAULT_SALT_LEN and SCRAM_SHA_256_DEFAULT_ITERATIONS. */
const SCRAM_SALT_LENGTH = 16;
export const SCRAM_ITERATIONS = 4096;

export interface ScramSecretOptions {
  /** Test hook. Production callers leave it unset to get a random 16-byte salt. */
  salt?: Buffer;
  iterations?: number;
}

const hmacSha256 = (key: Buffer, message: string): Buffer =>
  createHmac('sha256', key).update(message).digest();

/**
 * Builds the value PostgreSQL stores in pg_authid.rolpassword, exactly like
 * scram_build_secret() in src/common/scram-common.c:
 *
 *   SCRAM-SHA-256$<iterations>:<b64 salt>$<b64 StoredKey>:<b64 ServerKey>
 *
 * SaltedPassword = Hi(password, salt, i) (PBKDF2-HMAC-SHA-256, 32 bytes),
 * ClientKey = HMAC(SaltedPassword, "Client Key"), StoredKey = SHA-256(ClientKey),
 * ServerKey = HMAC(SaltedPassword, "Server Key").
 *
 * pg_be_scram_build_secret() runs SASLprep first and falls back to the raw
 * password when that fails. For ASCII input SASLprep either returns the input
 * unchanged or fails, so ASCII passwords are used as given. Non-ASCII passwords
 * are rejected rather than hashed differently from the server; the control
 * plane only ever stores passwords it generated itself.
 */
export function buildScramSecret(
  password: string,
  options: ScramSecretOptions = {},
): string {
  if (password.length === 0)
    throw new Error('SCRAM password must not be empty');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ASCII range is the point
  if (!/^[\x00-\x7f]*$/.test(password)) {
    throw new Error(
      'SCRAM passwords must be ASCII: SASLprep for other characters is not implemented',
    );
  }
  const salt = options.salt ?? randomBytes(SCRAM_SALT_LENGTH);
  const iterations = options.iterations ?? SCRAM_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(
      `SCRAM iteration count must be positive, got ${iterations}`,
    );
  }

  const saltedPassword = pbkdf2Sync(
    Buffer.from(password, 'utf8'),
    salt,
    iterations,
    32,
    'sha256',
  );
  const clientKey = hmacSha256(saltedPassword, 'Client Key');
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = hmacSha256(saltedPassword, 'Server Key');

  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
