/** Process liveness only. Dependency availability is reported by /api/health/ready. */
export function GET() {
  return Response.json({ status: "alive" }, { headers: { "cache-control": "no-store" } });
}
