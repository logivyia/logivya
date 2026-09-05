import { apiClient } from "@/api/client";

export type MobileCompanyProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type UpdateMobileCompanyProfileInput = Pick<MobileCompanyProfile, "name" | "phone">;

export function getMobileCompanyProfile() {
  return apiClient.request<{ company: MobileCompanyProfile }>("/api/mobile/company/profile");
}

export function updateMobileCompanyProfile(input: UpdateMobileCompanyProfileInput) {
  return apiClient.request<{ success: true; company: MobileCompanyProfile }>("/api/mobile/company/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
