import { requirePrivacyAuth } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { downloadPrivacyExport } from "@/server/privacy/export";
import { writeAuditLog } from "@/server/security/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePrivacyAuth(request);
    const { id } = await context.params;
    const token = request.headers.get("x-privacy-download-token");
    if (!token || token.length > 256) throw new PrivacyError("PRIVACY_EXPORT_TOKEN_REQUIRED", 401);
    const data = await downloadPrivacyExport({ companyId: auth.company.id, userId: auth.user.id, publicId: id, token });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: "privacy.export.downloaded", entityType: "PrivacyExportJob", entityId: id });
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="logivya-privacy-export-${id}.json"`,
        "cache-control": "no-store, private",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
