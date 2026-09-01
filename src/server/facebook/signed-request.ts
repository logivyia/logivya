import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { facebookAppSecret } from "@/server/facebook/constants";

type FacebookSignedRequestPayload = {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
  [key: string]: unknown;
};

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
}

export function verifyFacebookSignedRequest(value: string): FacebookSignedRequestPayload {
  const [encodedSignature, encodedPayload, extra] = value.trim().split(".");
  if (!encodedSignature || !encodedPayload || extra) throw new Error("FACEBOOK_SIGNED_REQUEST_INVALID");
  const signature = decodeBase64Url(encodedSignature);
  const expected = createHmac("sha256", facebookAppSecret()).update(encodedPayload).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new Error("FACEBOOK_SIGNED_REQUEST_INVALID");
  }
  let payload: FacebookSignedRequestPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as FacebookSignedRequestPayload;
  } catch {
    throw new Error("FACEBOOK_SIGNED_REQUEST_INVALID");
  }
  if (payload.algorithm?.toUpperCase() !== "HMAC-SHA256" || typeof payload.user_id !== "string" || !payload.user_id.trim()) {
    throw new Error("FACEBOOK_SIGNED_REQUEST_INVALID");
  }
  return payload;
}

export async function readFacebookSignedRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let value = "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({})) as { signed_request?: unknown };
    value = typeof body.signed_request === "string" ? body.signed_request : "";
  } else {
    const form = await request.formData().catch(() => null);
    const candidate = form?.get("signed_request");
    value = typeof candidate === "string" ? candidate : "";
  }
  if (!value || value.length > 20_000) throw new Error("FACEBOOK_SIGNED_REQUEST_INVALID");
  return verifyFacebookSignedRequest(value);
}
