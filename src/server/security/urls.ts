export function assertSafeExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv6 = host === "::" || host === "::1" || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host);
  const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const candidate = mappedIpv4 || host;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || privateIpv6 || /^0\./.test(candidate) || /^127\./.test(candidate) || /^10\./.test(candidate) || /^192\.168\./.test(candidate) || /^169\.254\./.test(candidate) || /^172\.(1[6-9]|2\d|3[01])\./.test(candidate)) {
    throw new Error("Private network targets are not allowed");
  }
  return url;
}
