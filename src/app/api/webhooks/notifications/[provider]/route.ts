import { NextResponse } from "next/server";
import { z } from "zod";
import { recordNotificationProviderWebhook } from "@/server/notifications/engine";
import { HmacWebhookSigner } from "@/server/security/webhook-signing";
import { readBoundedRequestText, RequestBodyError } from "@/server/security/request-body";

const schema = z.object({
  eventId: z.string().min(1).max(240),
  eventType: z.string().min(1).max(160),
  messageId: z.string().min(1).max(500).optional(),
  status: z.enum(["SENT", "ACCEPTED", "DELIVERED", "FAILED", "BOUNCED", "REJECTED", "EXPIRED"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const normalizedProvider = provider.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const secret = process.env[`NOTIFICATION_WEBHOOK_SECRET_${normalizedProvider.toUpperCase().replace(/-/g, "_")}`];
  if (!secret) return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  let rawBody: string;
  try { rawBody = await readBoundedRequestText(request, 1_000_000); }
  catch (error) {
    return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_PAYLOAD_INVALID" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const signature = request.headers.get("x-logivya-signature") || "";
  const signatureValid = await new HmacWebhookSigner().verify(rawBody, signature, secret);
  if (!signatureValid) return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_SIGNATURE_INVALID" }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_PAYLOAD_INVALID" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_PAYLOAD_INVALID" }, { status: 400 });
  const webhook = await recordNotificationProviderWebhook({
    provider: normalizedProvider,
    providerEventId: parsed.data.eventId,
    eventType: parsed.data.eventType,
    signatureValid,
    rawBody,
    providerMessageId: parsed.data.messageId,
    status: parsed.data.status,
  });
  return NextResponse.json({ ok: true, webhookId: webhook.id });
}
