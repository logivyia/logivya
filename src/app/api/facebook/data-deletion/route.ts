import { completeFacebookDataDeletion } from "@/server/facebook/provider-callbacks";
import { readFacebookSignedRequest } from "@/server/facebook/signed-request";

export async function POST(request: Request) {
  try {
    const payload = await readFacebookSignedRequest(request);
    const result = await completeFacebookDataDeletion(payload.user_id as string);
    return Response.json({ url: result.statusUrl, confirmation_code: result.confirmationCode });
  } catch {
    return Response.json({ error: "INVALID_SIGNED_REQUEST" }, { status: 400 });
  }
}
