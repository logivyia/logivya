import { mobileError, mobileSafeError } from "@/server/mobile/response";

export function freightSafeError(error: unknown) {
  const code = error instanceof Error ? error.message : "FREIGHT_REQUEST_FAILED";
  if (code === "FREIGHT_MARKETPLACE_NOT_FOUND") {
    return mobileError("NOT_FOUND", "api.error.generic", { status: 404 });
  }
  if (["FREIGHT_LISTING_NOT_FOUND", "VEHICLE_LISTING_NOT_FOUND", "DRIVER_LISTING_NOT_FOUND", "MARKETPLACE_REQUEST_NOT_FOUND", "MARKETPLACE_MATCH_NOT_FOUND", "SMART_MATCH_RESULT_NOT_FOUND"].includes(code)) {
    return mobileError(code, "api.error.notFound", { status: 404 });
  }
  if (code === "FREIGHT_LISTING_NOT_EDITABLE" || code === "FREIGHT_STATUS_TRANSITION_INVALID") {
    return mobileError(code, "api.error.validation", { status: 409 });
  }
  if (["MARKETPLACE_REQUEST_STATUS_INVALID", "MARKETPLACE_REQUEST_EXPIRED"].includes(code)) {
    return mobileError(code, "api.error.validation", { status: 409 });
  }
  if (["MARKETPLACE_CURSOR_INVALID", "FREIGHT_INVALID_DATE", "FREIGHT_LOADING_DATE_PAST", "FREIGHT_INVALID_PHONE", "FREIGHT_CURRENCY_REQUIRED", "MARKETPLACE_DATE_RANGE_INVALID"].includes(code)) {
    return mobileError(code, "api.error.validation", { status: 400 });
  }
  return mobileSafeError(error, "api.error.generic");
}
