export class RequestBodyError extends Error {
  constructor(public readonly code: "REQUEST_BODY_TOO_LARGE" | "REQUEST_BODY_INVALID_LENGTH" | "REQUEST_BODY_TIMEOUT", public readonly status: number) {
    super(code);
    this.name = "RequestBodyError";
  }
}

/** Bound actual bytes BEFORE text/form parsing, including chunked/lying clients. */
export async function readBoundedRequestBytes(request: Request, maxBytes: number, timeoutMs = 60_000): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("Invalid request body limits");
  }
  const length = request.headers.get("content-length");
  const cancelBody = (error: Error) => { void request.body?.cancel(error).catch(() => undefined); };
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    const error = new RequestBodyError("REQUEST_BODY_INVALID_LENGTH", 400);
    cancelBody(error);
    throw error;
  }
  if (length !== null && Number(length) > maxBytes) {
    const error = new RequestBodyError("REQUEST_BODY_TOO_LARGE", 413);
    cancelBody(error);
    throw error;
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestBodyError("REQUEST_BODY_TIMEOUT", 408)), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestBodyError("REQUEST_BODY_TOO_LARGE", 413);
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    // Never await cancellation of an uncooperative remote stream.
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function readBoundedRequestText(request: Request, maxBytes: number, timeoutMs = 15_000) {
  return (await readBoundedRequestBytes(request, maxBytes, timeoutMs)).toString("utf8");
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  // Parsing only starts after the transport stream has passed the byte limit.
  const body = new Uint8Array(bytes);
  return new Response(body, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
}
