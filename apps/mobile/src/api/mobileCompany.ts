import { apiClient } from "@/api/client";

export type MobileCompanyProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
};

export type UpdateMobileCompanyProfileInput = Omit<MobileCompanyProfile, "id">;

export function getMobileCompanyProfile() {
  return apiClient.request<{ company: MobileCompanyProfile }>("/api/mobile/company/profile");
}

export function updateMobileCompanyProfile(input: UpdateMobileCompanyProfileInput) {
  return apiClient.request<{ success: true; company: MobileCompanyProfile }>("/api/mobile/company/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
