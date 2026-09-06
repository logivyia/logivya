import { getRequestLocale } from "@/i18n/server";
import { NextResponse } from "next/server";
import { mobileSuccess } from "@/server/mobile/response";
import { listingDateCompatibilityMessage, needsListingDateCompatibility } from "./mobile-date-contract";

/** Keep unknown dates truthful while pre-227 Android / pre-193 iOS are installed. */
export async function mobileListingSuccess<T>(request: Request, data: T) {
  if (needsListingDateCompatibility(request.headers, data)) {
    // This is trusted product copy, never an exception/provider message. The
    // general API sanitizer deliberately replaces unknown dynamic messages.
    return NextResponse.json({ success: false, error: {
      code: "FREIGHT_DATE_FORMAT_UNSUPPORTED",
      message: listingDateCompatibilityMessage(await getRequestLocale()),
      details: { webUrl: "https://www.logivya.com/explore" },
    } }, { status: 409 });
  }
  return mobileSuccess(data);
}
