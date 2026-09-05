import "server-only";

import { createHmac, randomBytes } from "node:crypto";

export class IyzicoApiError extends Error {
  constructor(
    code: string,
    public readonly httpStatus = 502,
  ) {
    super(code);
    this.name = "IyzicoApiError";
  }
}

export function iyzicoConfiguration() {
  const apiKey = process.env.IYZICO_API_KEY?.trim();
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) {
    throw new IyzicoApiError("IYZICO_NOT_CONFIGURED", 503);
  }

  const rawBaseUrl = (process.env.IYZICO_API_URL || "https://api.iyzipay.com").replace(/\/$/u, "");
  const baseUrl = new URL(rawBaseUrl);
  const allowedHosts = new Set(["api.iyzipay.com", "sandbox-api.iyzipay.com"]);
  if (baseUrl.protocol !== "https:" || !allowedHosts.has(baseUrl.hostname) || baseUrl.pathname !== "/") {
    throw new IyzicoApiError("IYZICO_API_URL_INVALID", 500);
  }

  return { apiKey, secretKey, baseUrl: baseUrl.origin };
}

export async function iyzicoPost<T>(path: string, payload: Record<string, unknown>) {
  if (!path.startsWith("/") || path.includes("..")) {
    throw new IyzicoApiError("IYZICO_API_PATH_INVALID", 500);
  }
  const { apiKey, secretKey, baseUrl } = iyzicoConfiguration();
  const body = JSON.stringify(payload);
  const randomKey = `${Date.now()}${randomBytes(12).toString("hex")}`;
  const signature = createHmac("sha256", secretKey)
    .update(`${randomKey}${path}${body}`)
    .digest("hex");
  const authorization = Buffer.from(
    `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`,
    "utf8",
  ).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `IYZWSv2 ${authorization}`,
        "content-type": "application/json",
        "x-iyzi-rnd": randomKey,
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 1_000_000) {
      throw new IyzicoApiError("IYZICO_RESPONSE_TOO_LARGE");
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new IyzicoApiError("IYZICO_INVALID_RESPONSE");
    }
    if (!response.ok || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new IyzicoApiError("IYZICO_REQUEST_FAILED");
    }
    return value as T;
  } catch (error) {
    if (error instanceof IyzicoApiError) throw error;
    throw new IyzicoApiError("IYZICO_REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
