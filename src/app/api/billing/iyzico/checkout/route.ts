import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { initializeIyzicoCheckout, IyzicoCheckoutError } from "@/server/billing/iyzico-checkout";
import {
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { assertSubscriptionRequestCsrf } from "@/server/billing/subscription-request-security";
import { requestId } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  requestId: z.string().trim().min(1).max(128),
  acceptedDocuments: z.array(z.object({
    type: z.enum([
      "PRE_INFORMATION_FORM",
      "DISTANCE_SALES_AGREEMENT",
      "REFUND_WITHDRAWAL_POLICY",
    ]),
    version: z.string().trim().min(1).max(80),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
  })).length(3),
  immediatePerformanceConsent: z.literal(true),
});

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    assertSubscriptionRequestCsrf(request);
    const { company, user } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", correlationId }, { status: 400 });
    }
    await enforceOperationRateLimit({
      scope: "iyzico-checkout-initialize",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 8,
      windowMs: 60 * 60_000,
      request,
    });
    const result = await initializeIyzicoCheckout({
      ...parsed.data,
      companyId: company.id,
      userId: user.id,
      correlationId,
      locale: request.headers.get("x-logivya-locale") || user.locale || "tr",
      request,
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "IYZICO_CHECKOUT_INITIALIZED",
      entityType: "Payment",
      entityId: result.paymentId,
      correlationId,
      after: {
        requestId: parsed.data.requestId,
        paymentProvider: "IYZICO",
        redirectHost: new URL(result.checkoutUrl).hostname,
      },
    });
    return NextResponse.json(
      { checkoutUrl: result.checkoutUrl, paymentId: result.paymentId, correlationId },
      { status: 201, headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId } },
    );
  } catch (error) {
    if (error instanceof IyzicoCheckoutError) {
      return NextResponse.json(
        { error: error.message, correlationId },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId } },
      );
    }
    return NextResponse.json(
      { ...manualSubscriptionRequestErrorBody(error), correlationId },
      {
        status: manualSubscriptionRequestStatus(error),
        headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
      },
    );
  }
}

