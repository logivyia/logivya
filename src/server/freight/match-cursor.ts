export type MatchCursor = { v: 1; d: string; a: string; s: number; t: string; i: string; p: string };
export function encodeMatchCursor(value: MatchCursor) {
  return `m1.${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}
export function decodeMatchCursor(value: string | undefined, demandId: string): MatchCursor | null {
  if (!value) return null;
  try {
    if (!value.startsWith("m1.")) return null; // Legacy internal-row cursor is resolved by the service.
    const c = JSON.parse(Buffer.from(value.slice(3), "base64url").toString()) as MatchCursor;
    if (c.v !== 1 || c.d !== demandId || !Number.isFinite(c.s) || c.s < 0 || c.s > 100
      || typeof c.i !== "string" || !c.i || !["LOGIVYA", "EXTERNAL"].includes(c.p)
      || typeof c.a !== "string" || typeof c.t !== "string"
      || !Number.isFinite(Date.parse(c.a)) || !Number.isFinite(Date.parse(c.t))) throw new Error();
    return c;
  } catch { throw new Error("MARKETPLACE_CURSOR_INVALID"); }
}
export function compareMatchPosition(a: {score:number;matchedAt:string;id:string;sourcePlatform:string}, b: {score:number;matchedAt:string;id:string;sourcePlatform:string}) {
  const ap = a.sourcePlatform === "LOGIVYA" ? "LOGIVYA" : "EXTERNAL";
  const bp = b.sourcePlatform === "LOGIVYA" ? "LOGIVYA" : "EXTERNAL";
  return b.score-a.score || Date.parse(b.matchedAt)-Date.parse(a.matchedAt)
    || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    || (ap < bp ? 1 : ap > bp ? -1 : 0);
}
