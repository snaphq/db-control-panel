import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";

type EndpointPolicy = {
  label: string;
  allowlistEnv: string;
  defaultAllowedHosts?: string[];
};

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function parseIpv6Groups(value: string): number[] | null {
  const dottedIndex = value.lastIndexOf(":");
  let input = value;
  if (dottedIndex >= 0) {
    const dottedTail = value.slice(dottedIndex + 1);
    if (isIP(dottedTail) === 4) {
      const octets = dottedTail.split(".").map(Number);
      const high = (octets[0] << 8) | octets[1];
      const low = (octets[2] << 8) | octets[3];
      input = `${value.slice(0, dottedIndex)}:${high.toString(16)}:${low.toString(16)}`;
    }
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const parseGroup = (group: string) =>
    /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : null;
  const parsedLeft = left.map(parseGroup);
  const parsedRight = right.map(parseGroup);
  if (
    parsedLeft.some((group) => group === null) ||
    parsedRight.some((group) => group === null)
  ) {
    return null;
  }
  const groups = [...(parsedLeft as number[])];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups.push(...Array.from({ length: missing }, () => 0));
  }
  groups.push(...(parsedRight as number[]));
  return groups.length === 8 ? groups : null;
}

function groupsToIpv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    const groups = parseIpv6Groups(normalized);
    if (groups) {
      const isMapped =
        groups.slice(0, 5).every((group) => group === 0) &&
        groups[5] === 0xffff;
      const isCompatible = groups.slice(0, 6).every((group) => group === 0);
      const isNat64 = groups[0] === 0x0064 && groups[1] === 0xff9b;
      if (isMapped || isCompatible || isNat64) {
        const mapped = groupsToIpv4(groups[6], groups[7]);
        if (isPrivateAddress(mapped)) return true;
      }
    }
    if (!groups) return true;
    const first = groups[0];
    return (
      groups.every((group) => group === 0) ||
      (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x2001 && groups[1] === 0x0db8) ||
      (first === 0x2001 && groups[1] === 0x0002 && groups[2] === 0x0000) ||
      (first === 0x2001 && (groups[1] & 0xfff0) === 0x0010) ||
      (first === 0x3fff && (groups[1] & 0xf000) === 0x0000)
    );
  }
  return true;
}

function normalizeAllowlistHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("*.")) {
    return `*.${normalized.slice(2).replace(/\.$/, "")}`;
  }
  return normalized.replace(/\.$/, "");
}

function configuredAllowlist(envName: string): string[] | null {
  const raw = process.env[envName];
  if (raw === undefined) return null;
  return raw.split(",").map(normalizeAllowlistHost).filter(Boolean);
}

function isAllowedHost(
  hostname: string,
  envName: string,
  defaultHosts: string[],
): boolean {
  const configured = configuredAllowlist(envName);
  const production = isProductionRuntime();
  if (configured && configured.length === 0 && !production) return true;
  if (configured === null && !production) return true;
  const allowedHosts =
    configured && configured.length > 0
      ? configured
      : defaultHosts.map(normalizeAllowlistHost);
  const host = normalizeAllowlistHost(hostname);
  return allowedHosts.some((allowed) =>
    allowed.startsWith("*.")
      ? host.endsWith(allowed.slice(1)) && host !== allowed.slice(2)
      : host === allowed,
  );
}

async function assertSafeEndpoint(
  endpointUrl: string,
  policy: EndpointPolicy,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    throw new Error(`${policy.label} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${policy.label} must use http or https`);
  }
  if (isProductionRuntime() && url.protocol !== "https:") {
    throw new Error(`${policy.label} must use HTTPS in production`);
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(
      `${policy.label} cannot contain credentials, queries, or fragments`,
    );
  }
  if (
    !isAllowedHost(
      url.hostname,
      policy.allowlistEnv,
      policy.defaultAllowedHosts ?? [],
    )
  ) {
    throw new Error(
      `${policy.label} host '${url.hostname}' is not allowlisted`,
    );
  }
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error(`${policy.label} cannot target a private or local address`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: url.hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error(`${policy.label} resolves to a private or local address`);
  }
  return url;
}

function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      const publicAddresses = addresses.filter(
        (entry) =>
          (entry.family === 4 || entry.family === 6) &&
          !isPrivateAddress(entry.address),
      );
      const family =
        options.family === 4 || options.family === 6
          ? options.family
          : undefined;
      const candidates = family
        ? publicAddresses.filter((entry) => entry.family === family)
        : publicAddresses;
      if (candidates.length === 0) {
        callback(
          Object.assign(
            new Error("AI provider resolves to a private or local address"),
            {
              code: "EPRIVATEIP",
            },
          ) as NodeJS.ErrnoException,
          "",
          0,
        );
        return;
      }
      if (options.all) callback(null, candidates);
      else callback(null, candidates[0].address, candidates[0].family);
    })
    .catch((error: unknown) => {
      callback(
        error instanceof Error
          ? (error as NodeJS.ErrnoException)
          : Object.assign(new Error("AI provider DNS lookup failed"), {
              code: "ENOTFOUND",
            }),
        "",
        0,
      );
    });
}

const dispatcher = new Agent({
  connect: { lookup: safeLookup },
  maxRedirections: 0,
});

const MAX_PROVIDER_RESPONSE_BYTES = 8_000_000;

async function limitResponseBody(
  response: Response,
  maxBytes = MAX_PROVIDER_RESPONSE_BYTES,
): Promise<Response> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("AI provider response is too large");
  }

  const body = response.body;
  if (!body) return response;
  const reader = body.getReader();
  let total = 0;
  const bounded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          controller.error(new Error("AI provider response is too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  return new Response(bounded, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function fetchSafeProvider(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url =
    input instanceof URL
      ? input
      : typeof input === "string"
        ? new URL(input)
        : new URL(input.url);
  await assertSafeEndpoint(url.toString(), {
    label: "AI provider endpoint",
    allowlistEnv: "AI_PROVIDER_ALLOWED_HOSTS",
    defaultAllowedHosts: ["api.openai.com"],
  });
  const response = await fetch(input, {
    ...init,
    redirect: "error",
    dispatcher,
  } as RequestInit & { dispatcher: Agent });
  return limitResponseBody(response);
}

export function validateProviderBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("OPENAI_BASE_URL must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("OPENAI_BASE_URL must use http or https");
  }
  if (isProductionRuntime() && url.protocol !== "https:") {
    throw new Error("OPENAI_BASE_URL must use HTTPS in production");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(
      "OPENAI_BASE_URL cannot contain credentials, queries, or fragments",
    );
  }
  if (
    !isAllowedHost(url.hostname, "AI_PROVIDER_ALLOWED_HOSTS", [
      "api.openai.com",
    ])
  ) {
    throw new Error(
      `OPENAI_BASE_URL host '${url.hostname}' is not allowlisted`,
    );
  }
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error("OPENAI_BASE_URL cannot target a private or local address");
  }
  return url;
}
