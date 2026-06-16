import { apiClient } from "@/api/client";

export type MobileFeedbackType = "BUG" | "FEATURE";

export type SubmitMobileFeedbackInput = {
  type: MobileFeedbackType;
  subject: string;
  message: string;
  screenshot?: string;
  deviceInfo?: Record<string, unknown>;
  appVersion?: string;
};

export type MobileFeedbackResult = {
  id: string;
  type: MobileFeedbackType;
  subject: string;
  status: string;
  createdAt: string;
};

export function submitMobileFeedback(input: SubmitMobileFeedbackInput) {
  return apiClient.post<{ feedback: MobileFeedbackResult }>("/api/mobile/feedback", input);
}
