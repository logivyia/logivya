import { NextResponse } from "next/server";

import {
  completeIyzicoCheckout,
  IyzicoCheckoutError,
  iyzicoApplicationBaseUrl,
} from "@/server/billing/iyzico-checkout";
import { requestId } from "@/server/security/admin-request";
import { readBoundedFormData, RequestBodyError } from "@/server/security/request-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resultRedirect(request: Request, result: "success" | "failed", code?: string) {
  const url = new URL("/settings/subscriptions", iyzicoApplicationBaseUrl(request));
  url.searchParams.set("iyzico", result);
  if (code) url.searchParams.set("code", code.slice(0, 80));
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    const state = new URL(request.url).searchParams.get("state")?.trim();
    const form = await readBoundedFormData(request, 16_384);
    const tokenValue = form.get("token");
    const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
    if (!state || !token || state.length > 2_048 || token.length > 2_048) {
      return resultRedirect(request, "failed", "IYZICO_CALLBACK_INVALID");
    }
    await completeIyzicoCheckout({ state, token, correlationId });
    return resultRedirect(request, "success");
  } catch (error) {
    if (error instanceof RequestBodyError) return resultRedirect(request, "failed", "IYZICO_CALLBACK_INVALID");
    const code = error instanceof IyzicoCheckoutError
      ? error.message
      : "IYZICO_CALLBACK_FAILED";
    return resultRedirect(request, "failed", code);
  }
}
