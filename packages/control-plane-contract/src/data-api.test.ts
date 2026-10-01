import { describe, expect, it } from "vitest";
import {
  createDataApiTokenRequestSchema,
  jwksSchema,
  setDataApiJwksRequestSchema,
} from "./index.js";

const publicKey = {
  kty: "EC",
  crv: "P-256",
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  kid: "k1",
  alg: "ES256",
};

describe("Data API JWKS", () => {
  it("accepts a set of public keys", () => {
    expect(jwksSchema.parse({ keys: [publicKey] }).keys).toHaveLength(1);
  });

  it.each(["d", "k", "p", "q", "dp", "dq", "qi"])(
    "rejects a key carrying the secret member %s",
    (member) => {
      const result = jwksSchema.safeParse({
        keys: [{ ...publicKey, [member]: "secret" }],
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects an empty set", () => {
    expect(jwksSchema.safeParse({ keys: [] }).success).toBe(false);
  });

  it("lets a request return to the platform key with null", () => {
    expect(setDataApiJwksRequestSchema.parse({ jwks: null }).jwks).toBeNull();
  });
});

describe("Data API test tokens", () => {
  it("defaults to the authenticated role and one hour", () => {
    expect(createDataApiTokenRequestSchema.parse({})).toEqual({
      role: "authenticated",
      expires_in_seconds: 3600,
    });
  });

  it("refuses roles other than anonymous and authenticated", () => {
    expect(
      createDataApiTokenRequestSchema.safeParse({ role: "authenticator" })
        .success,
    ).toBe(false);
  });

  it("caps the lifetime at one day", () => {
    expect(
      createDataApiTokenRequestSchema.safeParse({ expires_in_seconds: 86_401 })
        .success,
    ).toBe(false);
  });
});
