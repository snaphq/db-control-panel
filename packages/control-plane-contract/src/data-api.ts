import { z } from "zod";
import { operationSchema, timestampSchema } from "./common.js";

/**
 * The two database roles a Data API request can run as. `authenticator` is the
 * login role PostgREST connects with and is never offered to clients.
 */
export const DATA_API_ROLES = ["anonymous", "authenticated"] as const;
export const dataApiRoleSchema = z.enum(DATA_API_ROLES);
export type DataApiRole = z.infer<typeof dataApiRoleSchema>;

/** JWK members that carry private or shared-secret key material (RFC 7517, 7518). */
const SECRET_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "k", "oth"];

export const jwkSchema = z
  .object({
    kty: z.string().min(1),
    kid: z.string().min(1).optional(),
    alg: z.string().min(1).optional(),
    use: z.string().min(1).optional(),
  })
  .passthrough()
  .refine(
    (key) => SECRET_JWK_MEMBERS.every((member) => !(member in key)),
    "Only public keys are accepted: remove private and shared-secret members",
  );
export type Jwk = z.infer<typeof jwkSchema>;

/** A JSON Web Key Set of public keys; PostgREST verifies bearer tokens against it. */
export const jwksSchema = z.object({
  keys: z.array(jwkSchema).min(1).max(10),
});
export type Jwks = z.infer<typeof jwksSchema>;

/** `source` is `platform` for the key the control plane issued and `custom` for one the project set. */
export const dataApiJwksResponseSchema = z.object({
  jwks: jwksSchema.nullable(),
  source: z.enum(["platform", "custom"]).nullable(),
});
export type DataApiJwksResponse = z.infer<typeof dataApiJwksResponseSchema>;

/**
 * `jwks: null` returns the project to its platform key. The sidecars read the
 * keys at start, so a change restarts the project's running computes through
 * `operation`; it is null when no database uses the Data API yet.
 */
export const setDataApiJwksRequestSchema = z.object({
  jwks: jwksSchema.nullable(),
});
export type SetDataApiJwksRequest = z.infer<typeof setDataApiJwksRequestSchema>;

export const setDataApiJwksResponseSchema = dataApiJwksResponseSchema.extend({
  operation: operationSchema.nullable(),
});
export type SetDataApiJwksResponse = z.infer<
  typeof setDataApiJwksResponseSchema
>;

export const MAX_DATA_API_TOKEN_SECONDS = 86_400;
export const DEFAULT_DATA_API_TOKEN_SECONDS = 3_600;

/** Mints a test token with the platform key; it does not work once a custom JWKS is set. */
export const createDataApiTokenRequestSchema = z.object({
  role: dataApiRoleSchema.default("authenticated"),
  /** Value of the `sub` claim, readable in SQL through `request.jwt.claims`. */
  sub: z.string().min(1).max(128).optional(),
  expires_in_seconds: z
    .number()
    .int()
    .positive()
    .max(MAX_DATA_API_TOKEN_SECONDS)
    .default(DEFAULT_DATA_API_TOKEN_SECONDS),
});
export type CreateDataApiTokenRequest = z.infer<
  typeof createDataApiTokenRequestSchema
>;

export const dataApiTokenResponseSchema = z.object({
  token: z.string(),
  role: dataApiRoleSchema,
  expires_at: timestampSchema,
});
export type DataApiTokenResponse = z.infer<typeof dataApiTokenResponseSchema>;
