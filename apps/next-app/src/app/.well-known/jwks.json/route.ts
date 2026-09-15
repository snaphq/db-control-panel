import {
  publicDiscoveryOptions,
  withPublicDiscoveryCors,
} from "@/lib/agent-auth/cors";
import { exportPublicKeyJwks } from "@/lib/agent-auth/keys";

/** Public key set for the agent-auth signing key (identity_assertions, access tokens). */
export async function GET(): Promise<Response> {
  try {
    const jwks = await exportPublicKeyJwks();
    return withPublicDiscoveryCors(
      Response.json(jwks, {
        headers: {
          "Cache-Control": "public, max-age=600, s-maxage=86400",
        },
      }),
    );
  } catch {
    return withPublicDiscoveryCors(
      Response.json({ keys: [] }, { status: 500 }),
    );
  }
}

export function OPTIONS(): Response {
  return publicDiscoveryOptions();
}
