import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "public" }),
});

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function requiredArgument(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function normalizedEmail(value: string) {
  const email = value.trim().toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email supplied for --support-email`);
  }
  return email;
}

function splitRegisteredName(value: string) {
  const parts = value.normalize("NFKC").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Owned company name must contain both first and last name");
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(" "),
  };
}

function normalizedPhone(value: string) {
  let digits = value.normalize("NFKC").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `90${digits.slice(1)}`;
  }
  if (!/^[1-9]\d{9,14}$/.test(digits)) {
    throw new Error("Owned company phone is invalid");
  }
  return `+${digits}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ownerEmail = normalizedEmail(requiredArgument("owner-email"));
  const supportEmail = normalizedEmail(requiredArgument("support-email"));

  const owner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      ownedCompanies: {
        select: {
          id: true,
          name: true,
          address: true,
          taxOffice: true,
          taxNumber: true,
          phone: true,
        },
      },
    },
  });
  if (!owner) throw new Error("Owner account was not found");
  if (owner.ownedCompanies.length !== 1) {
    throw new Error(
      `Expected exactly one owned company, found ${owner.ownedCompanies.length}`,
    );
  }

  const company = owner.ownedCompanies[0];
  const missingCompanyFields = [
    ["name", company.name],
    ["address", company.address],
    ["taxOffice", company.taxOffice],
    ["taxNumber", company.taxNumber],
    ["phone", company.phone],
  ].flatMap(([field, value]) => value?.trim() ? [] : [field]);
  if (missingCompanyFields.length) {
    throw new Error(
      `Owned company is missing required seller fields: ${missingCompanyFields.join(", ")}`,
    );
  }

  const registeredName = splitRegisteredName(company.name);
  const firstName = owner.firstName?.trim() || registeredName.firstName;
  const lastName = owner.lastName?.trim() || registeredName.lastName;
  const phone = normalizedPhone(company.phone!);
  const existingSeller = await prisma.billingSellerConfiguration.findUnique({
    where: { id: "logivya" },
  });

  const report = {
    mode: apply ? "APPLY" : "DRY_RUN",
    ownerFound: true,
    companyFound: true,
    profileRepairRequired:
      owner.firstName?.trim() !== firstName
      || owner.lastName?.trim() !== lastName
      || owner.name.trim() !== `${firstName} ${lastName}`,
    sellerConfigurationExists: Boolean(existingSeller),
    sellerConfigurationWillBeComplete: true,
    legalDocumentsApprovedAtPreserved:
      existingSeller?.legalDocumentsApprovedAt?.toISOString() || null,
    verifiedAtPreserved: existingSeller?.verifiedAt?.toISOString() || null,
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    const beforeProfile = {
      hasFirstName: Boolean(owner.firstName?.trim()),
      hasLastName: Boolean(owner.lastName?.trim()),
      fullNameNormalized: owner.name.trim() === `${firstName} ${lastName}`,
    };
    await tx.user.update({
      where: { id: owner.id },
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        actorType: "SYSTEM",
        action: "operations.manual_checkout_profile_identity_repaired",
        reason:
          "Checkout identity normalized from the authoritative owned-company registration.",
        entityType: "User",
        entityId: owner.id,
        beforeState: beforeProfile,
        afterState: {
          hasFirstName: true,
          hasLastName: true,
          fullNameNormalized: true,
        },
        metadata: {
          source: "OWNED_COMPANY_REGISTRATION",
          operation: "manual_subscription_checkout_recovery",
        },
      },
    });

    const seller = await tx.billingSellerConfiguration.upsert({
      where: { id: "logivya" },
      create: {
        id: "logivya",
        officialName: company.name.trim(),
        registeredAddress: company.address!.trim(),
        taxOffice: company.taxOffice!.trim(),
        taxNumber: company.taxNumber!.trim(),
        email: supportEmail,
        phone,
        tradeRegistryNotApplicable: true,
        mersisNotApplicable: true,
        legalDocumentsApprovedAt: null,
        verifiedAt: null,
        updatedByUserId: owner.id,
      },
      update: {
        officialName: company.name.trim(),
        registeredAddress: company.address!.trim(),
        taxOffice: company.taxOffice!.trim(),
        taxNumber: company.taxNumber!.trim(),
        email: supportEmail,
        phone,
        tradeRegistryNumber: null,
        tradeRegistryNotApplicable: true,
        mersisNumber: null,
        mersisNotApplicable: true,
        updatedByUserId: owner.id,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        actorType: "SYSTEM",
        action: "operations.billing_seller_configuration_reconciled",
        reason:
          "Manual checkout seller identity reconciled from authoritative company records.",
        entityType: "BillingSellerConfiguration",
        entityId: seller.id,
        beforeState: {
          existed: Boolean(existingSeller),
          complete: Boolean(
            existingSeller?.officialName
            && existingSeller.registeredAddress
            && existingSeller.taxOffice
            && existingSeller.taxNumber
            && existingSeller.email
            && existingSeller.phone,
          ),
        },
        afterState: {
          existed: true,
          complete: true,
          identityVerificationPreserved: Boolean(seller.verifiedAt),
          legalApprovalPreserved: Boolean(seller.legalDocumentsApprovedAt),
        },
        metadata: {
          source: "OWNED_COMPANY_REGISTRATION",
          operation: "manual_subscription_checkout_recovery",
        },
      },
    });
  }, {
    isolationLevel: "Serializable",
    timeout: 30_000,
  });

  console.log(JSON.stringify({ ...report, applied: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
