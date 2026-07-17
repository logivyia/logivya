import { PRIVACY_POLICY_VERSION } from "@/server/privacy/catalog";

export async function GET() {
  return Response.json({
    legalReviewStatus: "LEGAL_REVIEW_REQUIRED",
    version: PRIVACY_POLICY_VERSION,
    notices: [
      { type: "PRIVACY_NOTICE", label: "Gizlilik Politikasi", href: "/privacy-policy", publishedDraft: false },
      { type: "KVKK_NOTICE", label: "KVKK Aydinlatma Metni", href: "/kvkk", publishedDraft: false },
      { type: "TERMS", label: "Kullanim Kosullari", href: "/terms-of-service", publishedDraft: false },
    ],
  });
}
