import { NextResponse } from "next/server";
import { receivePaymentWebhook } from "@/server/billing/webhook-handler";

export async function POST(request: Request) {
  const result = await receivePaymentWebhook("PAYTR", request);
  if (result.status === 200) return new Response("OK", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.json(result.body, { status: result.status });
}
