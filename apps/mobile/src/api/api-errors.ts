export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly path: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function isAuthenticationRejection(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 401 || error.code === "UNAUTHORIZED");
}
