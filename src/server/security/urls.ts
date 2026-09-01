import { isIP } from "node:net";

function specialIpv4(host: string) {
  const [a, b, c] = host.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113);
}

function specialIpv6(host: string) {
  const [first, second] = host.split(":").map((part) => parseInt(part || "0", 16));
  // Only native global-unicast addresses. This also rejects all IPv4-mapped,
  // compatible, link-local, NAT64 and multicast spellings after URL normalization.
  return (first & 0xe000) !== 0x2000 || first === 0x2002
    || (first === 0x2001 && (second < 0x200 || second === 0xdb8))
    || (first === 0x3fff && second < 0x1000);
}

/** Syntax/literal-address guard only. A future fetcher must ALSO validate every
 * resolved address, pin the connection and revalidate/disable redirects.
 * This function alone does not prevent DNS rebinding. */
export function assertSafeExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  const family = isIP(host);
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || (family === 4 && specialIpv4(host)) || (family === 6 && specialIpv6(host))) {
    throw new Error("Private network targets are not allowed");
  }
  return url;
}
