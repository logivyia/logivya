import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { updateWhatsAppIngestionReviewFields } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";
import { publishReviewedWhatsAppExtraction } from "@/server/whatsapp-ingestion/processor";

const schema = z
  .object({
    reason: z.string().trim().min(5).max(1_000),
    primarySector: z
      .enum([
        "GENERAL_LOGISTICS",
        "HOME_MOVING",
        "PARTIAL_LOAD",
        "HEAVY_HAUL",
        "MULTI_SECTOR",
      ])
      .optional(),
    marketplaceScopes: z
      .array(z.enum(["GLOBAL", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"]))
      .min(1)
      .max(4)
      .refine(
        (value) => value.includes("GLOBAL"),
        "GLOBAL_MARKETPLACE_SCOPE_REQUIRED",
      )
      .optional(),
    title: z.string().trim().max(240).nullable().optional(),
    normalizedDescription: z.string().trim().max(2_000).nullable().optional(),
    originCity: z.string().trim().max(160).nullable().optional(),
    destinationCity: z.string().trim().max(160).nullable().optional(),
    cargoType: z.string().trim().max(160).nullable().optional(),
    tonnageMin: z.number().positive().max(200).nullable().optional(),
    tonnageMax: z.number().positive().max(200).nullable().optional(),
    trailerType: z
      .enum([
        "CURTAINSIDER",
        "OPEN_TRAILER",
        "CLOSED_TRAILER",
        "REFRIGERATED",
        "CONTAINER",
        "LOWBED",
        "TRUCK",
        "VAN",
        "OTHER",
      ])
      .nullable()
      .optional(),
    loadingDate: z
      .string()
      .regex(/^20\d{2}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    freightAmount: z
      .number()
      .positive()
      .max(1_000_000_000)
      .nullable()
      .optional(),
    freightCurrency: z.string().trim().length(3).nullable().optional(),
    publicContactPhone: z.string().trim().min(8).max(40).nullable().optional(),
    driverListingType: z
      .enum(["DRIVER_AVAILABLE", "DRIVER_WANTED"])
      .nullable()
      .optional(),
    driverLicenseClasses: z
      .array(z.enum(["B", "C", "CE", "D", "DE"]))
      .max(5)
      .optional(),
    driverExperienceYears: z
      .number()
      .int()
      .min(0)
      .max(60)
      .nullable()
      .optional(),
    driverEmploymentType: z
      .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"])
      .nullable()
      .optional(),
    driverInternationalExperience: z.boolean().optional(),
    driverAdrCertificate: z.boolean().optional(),
    driverSrcCertificate: z.boolean().optional(),
    driverPsychotechnicalCertificate: z.boolean().optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestIdentifier = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: "WHATSAPP_INGESTION_PUBLICATION_INPUT_INVALID",
          issues: parsed.error.issues,
          requestId: requestIdentifier,
        },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.whatsappIngestion.update",
      parsed.data.reason,
    );
    const { id } = await params;
    const { reason, ...fields } = parsed.data;
    if (Object.keys(fields).length)
      await updateWhatsAppIngestionReviewFields({
        id,
        ...fields,
        actorUserId: admin.user.id,
      });
    const publication = await publishReviewedWhatsAppExtraction({
      extractionId: id,
      actorUserId: admin.user.id,
      reviewNote: reason,
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "whatsapp.ingestion_review.published",
      entityType: "WhatsAppListingExtraction",
      entityId: id,
      reason,
      metadata: publication,
      requestId: requestIdentifier,
    });
    return NextResponse.json(
      { publication },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestIdentifier,
        },
      },
    );
  } catch (error) {
    return whatsappIngestionAdminError(error, requestIdentifier);
  }
}
