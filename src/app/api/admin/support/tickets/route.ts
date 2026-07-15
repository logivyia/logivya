import { NextResponse } from "next/server";
import { requireSupportSuperAdmin } from "@/server/support";
import { getAdminSupportMetrics, listAdminSupportTickets } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

function isTrue(value: string | null) {
  return value === "true" || value === "1";
}

export async function GET(request: Request) {
  try {
    const context = await requireSupportSuperAdmin(request);
    const params = new URL(request.url).searchParams;
    const [result, metrics] = await Promise.all([
      listAdminSupportTickets({
        cursor: params.get("cursor"),
        limit: Number(params.get("limit") || 30),
        status: params.get("status"),
        category: params.get("category"),
        priority: params.get("priority"),
        search: params.get("search") || params.get("q"),
        companyId: params.get("companyId"),
        userId: params.get("userId"),
        userEmail: params.get("userEmail"),
        assignedAdminId: params.get("assignedAdminId") === "ME" ? context.user.id : params.get("assignedAdminId"),
        unassignedOnly: isTrue(params.get("unassigned")) || isTrue(params.get("unassignedOnly")),
        sort: params.get("sort"),
        unreadOnly: isTrue(params.get("unread")) || isTrue(params.get("unreadOnly")),
        unansweredOnly: isTrue(params.get("unanswered")) || isTrue(params.get("unansweredOnly")),
        createdFrom: params.get("createdFrom"),
        createdTo: params.get("createdTo"),
        updatedFrom: params.get("updatedFrom"),
        updatedTo: params.get("updatedTo"),
      }),
      getAdminSupportMetrics(),
    ]);
    return NextResponse.json({ ...result, metrics, pagination: result.pageInfo });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_ADMIN_LIST_FAILED");
  }
}
