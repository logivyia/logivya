import { revokeFacebookUserData } from "@/server/facebook/provider-callbacks";
import { readFacebookSignedRequest } from "@/server/facebook/signed-request";

export async function POST(request: Request) {
  try {
    const payload = await readFacebookSignedRequest(request);
    await revokeFacebookUserData(payload.user_id as string);
    return Response.json({ success: true });
  } catch {
    return Response.json({ success: false }, { status: 400 });
  }
}
