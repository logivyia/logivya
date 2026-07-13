import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { addUserSupportMessage } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const schema = z.object({
  message: z.string().optional(),
  body: z.string().optional(),
  clientMessageId: z.string().optional(),
  attachmentUrl: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const result = await addUserSupportMessage({
      actor: context,
      identifier: id,
      reply: {
        body: parsed.data.body || parsed.data.message || "",
        clientMessageId: parsed.data.clientMessageId,
        attachmentUrl: parsed.data.attachmentUrl,
      },
      request,
    });
    scheduleSupportNotificationDelivery();
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_REPLY_FAILED");
  }
}
