export class PrivacyError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code);
    this.name = "PrivacyError";
  }
}

export function privacyErrorResponse(error: unknown) {
  if (error instanceof PrivacyError) return Response.json({ error: error.code }, { status: error.status });
  const code = error instanceof Error ? error.message : "PRIVACY_REQUEST_FAILED";
  if (code === "UNAUTHORIZED") return Response.json({ error: code }, { status: 401 });
  if (code === "FORBIDDEN" || code === "CSRF_REJECTED") return Response.json({ error: code }, { status: 403 });
  return Response.json({ error: "PRIVACY_REQUEST_FAILED" }, { status: 500 });
}
