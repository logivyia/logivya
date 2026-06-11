export function sanitizePlainText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
export function assertSafeRedirect(value: string, appOrigin: string) {
  const target = new URL(value, appOrigin);
  if (target.origin !== new URL(appOrigin).origin) throw new Error("External redirects are not allowed");
  return target.pathname + target.search + target.hash;
}
