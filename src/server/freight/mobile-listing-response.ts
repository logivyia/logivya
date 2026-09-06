import { getRequestLocale } from "@/i18n/server";
import { mobileError, mobileSuccess } from "@/server/mobile/response";
import { listingDateCompatibilityMessage, needsListingDateCompatibility } from "./mobile-date-contract";

/** Keep unknown dates truthful while pre-227 Android / pre-193 iOS are installed. */
export async function mobileListingSuccess<T>(request: Request, data: T) {
  if (needsListingDateCompatibility(request.headers, data)) {
    return mobileError("FREIGHT_DATE_FORMAT_UNSUPPORTED", listingDateCompatibilityMessage(await getRequestLocale()), {
      status: 409,
      details: { webUrl: "https://www.logivya.com/explore" },
    });
  }
  return mobileSuccess(data);
}
