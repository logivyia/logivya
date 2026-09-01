// Backwards-compatible endpoint for older web clients. Payment data is kept
// separate from the membership profile and is always stored as personal data.
export { GET, PUT } from "@/app/api/settings/payment-profile/route";
