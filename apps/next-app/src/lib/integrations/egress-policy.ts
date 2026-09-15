import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function isPrivateAddress(address: string): boolean {
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
    // IPv4-mapped, translated, and compatible IPv6 forms must be evaluated
    // using the IPv4 policy too. Parse the full address first so expanded
    // spellings such as `0:0:0:0:0:ffff:c000:0201` cannot bypass the check.
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

    // Compare numeric groups instead of textual prefixes. IPv6 has many
    // equivalent spellings (`2001:db8::` and `2001:0db8::`, for example), so
    // string-prefix checks can be bypassed by expanded or compressed forms.
    const first = groups[0];
    const isUnspecified = groups.every((group) => group === 0);
    const isLoopback =
      groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
    const isUniqueLocal = (first & 0xfe00) === 0xfc00; // fc00::/7
    const isLinkLocal = (first & 0xffc0) === 0xfe80; // fe80::/10
    const isMulticast = (first & 0xff00) === 0xff00; // ff00::/8
    const isDocumentation = first === 0x2001 && groups[1] === 0x0db8; // 2001:db8::/32
    const isBenchmark =
      first === 0x2001 && groups[1] === 0x0002 && groups[2] === 0x0000; // 2001:2::/48
    const isOrchid = first === 0x2001 && (groups[1] & 0xfff0) === 0x0010; // 2001:10::/28
    const isDocumentation3fff =
      first === 0x3fff && (groups[1] & 0xf000) === 0x0000; // 3fff::/20

    return (
      isLoopback ||
      isUnspecified ||
      isUniqueLocal ||
      isLinkLocal ||
      isMulticast ||
      isDocumentation ||
      isBenchmark ||
      isOrchid ||
      isDocumentation3fff
    );
  }
  return true;
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
  envName = "MCP_PROXY_ALLOWED_HOSTS",
  defaultHosts: string[] = [],
): boolean {
  const configured = configuredAllowlist(envName);
  const production = isProductionRuntime();
  if (
    configured &&
    configured.length === 0 &&
    (!production || defaultHosts.length === 0)
  ) {
    return !production;
  }
  if (configured === null && !production) return true;
  const allowedHosts =
    configured && configured.length > 0
      ? configured
      : defaultHosts.map(normalizeAllowlistHost);
  if (allowedHosts.length > 0) {
    const host = normalizeAllowlistHost(hostname);
    return allowedHosts.some((allowed) =>
      allowed.startsWith("*.")
        ? host.endsWith(allowed.slice(1)) && host !== allowed.slice(2)
        : host === allowed,
    );
  }

  // Production must opt into an egress allowlist unless the caller supplied a
  // small built-in default (the canonical OpenAI host). This keeps a
  // compromised installation from turning the app into an arbitrary
  // credential proxy.
  return false;
}

export type EndpointPolicy = {
  label: string;
  allowlistEnv: string;
  defaultAllowedHosts?: string[];
  rejectQuery?: boolean;
};

/** Validate URL syntax, protocol, hostname policy, and DNS addresses. */
export async function assertSafeEndpoint(
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
  if (url.username || url.password || url.hash) {
    throw new Error(`${policy.label} cannot contain credentials or fragments`);
  }
  if (policy.rejectQuery && url.search) {
    throw new Error(`${policy.label} cannot contain a query string`);
  }
  if (
    !isAllowedHost(
      url.hostname,
      policy.allowlistEnv,
      policy.defaultAllowedHosts,
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
