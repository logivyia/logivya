import { listFacebookPages } from "@/server/facebook/accounts";
import { requireFacebookPagesAccess } from "@/server/facebook/access";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    return mobileSuccess({ accounts: await listFacebookPages(auth.company.id, auth.user.id) });
  } catch (error) {
    return facebookSafeError(error);
  }
}
