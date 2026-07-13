import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { createSupportTicket, listUserSupportTickets } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const createSchema = z.object({
  subject: z.string(),
  category: z.string().optional(),
  type: z.string().optional(),
  message: z.string().optional(),
  body: z.string().optional(),
  description: z.string().optional(),
  clientMessageId: z.string().optional(),
  clientRequestId: z.string().optional(),
  attachmentUrl: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const params = new URL(request.url).searchParams;
    const result = await listUserSupportTickets(context, {
      cursor: params.get("cursor"),
      limit: Number(params.get("limit") || 20),
      status: params.get("status"),
      category: params.get("category"),
      search: params.get("search") || params.get("q"),
    });
    return NextResponse.json({ ...result, pagination: result.pageInfo });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_LIST_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const result = await createSupportTicket({
      actor: context,
      subject: parsed.data.subject,
      category: parsed.data.category || parsed.data.type || "",
      message: parsed.data.message || parsed.data.body || parsed.data.description || "",
      source: "WEB",
      clientMessageId: parsed.data.clientMessageId,
      clientRequestId: parsed.data.clientRequestId,
      attachmentUrl: parsed.data.attachmentUrl,
      request,
    });
    scheduleSupportNotificationDelivery();
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_CREATE_FAILED");
  }
}
