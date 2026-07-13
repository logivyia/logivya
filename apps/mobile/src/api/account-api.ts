import { apiClient } from "@/api/client";

export function deleteAccountRequest(confirmation: string) {
  return apiClient.post<{ ok: boolean; message: string }>("/api/mobile/account/delete", { confirmation });
}
