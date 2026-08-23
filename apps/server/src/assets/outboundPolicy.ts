import { lookup as systemLookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type OutboundResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface ApprovedOutboundTarget {
  url: URL;
  hostname: string;
  addresses: readonly ResolvedAddress[];
}

export interface OutboundPolicyOptions {
  allowedSchemes?: readonly string[];
  resolver?: OutboundResolver;
}

const defaultResolver: OutboundResolver = async (hostname) => {
  const rows = await systemLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family === 6 ? 6 : 4 }));
};

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }
  return parsed.range() === "unicast";
}

export async function approveOutboundUrl(
  rawUrl: string | URL,
  options: OutboundPolicyOptions = {},
): Promise<ApprovedOutboundTarget> {
  const url = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  const allowedSchemes = options.allowedSchemes ?? ["https:"];
  if (!allowedSchemes.includes(url.protocol)) throw new Error("asset.scheme_not_allowed");
  if (url.username || url.password) throw new Error("asset.url_credentials_not_allowed");
  if (!url.hostname) throw new Error("asset.hostname_required");

  const resolver = options.resolver ?? defaultResolver;
  const literal = ipaddr.isValid(url.hostname) ? url.hostname : undefined;
  const addresses = literal
    ? [
        {
          address: literal,
          family: ipaddr.parse(literal).kind() === "ipv4" ? (4 as const) : (6 as const),
        },
      ]
    : await resolver(url.hostname);
  if (addresses.length === 0) throw new Error("asset.dns_empty");
  if (addresses.some((row) => !isPublicAddress(row.address))) {
    throw new Error("asset.address_not_public");
  }

  return Object.freeze({
    url,
    hostname: url.hostname,
    addresses: Object.freeze(addresses.map((row) => Object.freeze({ ...row }))),
  });
}

export function assertRedirectLimit(redirectsFollowed: number, maximum = 5): void {
  if (redirectsFollowed >= maximum) throw new Error("asset.redirect_limit_exceeded");
}

export function createPinnedLookup(target: ApprovedOutboundTarget): LookupFunction {
  let cursor = 0;
  return ((hostname, _options, callback) => {
    if (hostname !== target.hostname) {
      callback(new Error("asset.pinned_hostname_mismatch"), "", 4);
      return;
    }
    const selected = target.addresses[cursor++ % target.addresses.length];
    callback(null, selected.address, selected.family);
  }) as LookupFunction;
}
