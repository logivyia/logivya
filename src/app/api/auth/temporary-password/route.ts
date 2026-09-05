import { NextResponse } from "next/server";

import {
  completeTemporaryPasswordChange,
  completeTemporaryPasswordChangeSchema,
  temporaryPasswordErrorStatus,
  temporaryPasswordPublicErrorCode,
} from "@/server/auth/temporary-password";

const noStoreHeaders = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

export async function POST(request: Request) {
  try {
    const parsed = completeTemporaryPasswordChangeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: noStoreHeaders });
    }
    await completeTemporaryPasswordChange(request, parsed.data);
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    const code = temporaryPasswordPublicErrorCode(error);
    return NextResponse.json(
      { error: code },
      { status: temporaryPasswordErrorStatus(code), headers: noStoreHeaders },
    );
  }
}
