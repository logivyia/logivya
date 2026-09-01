export const CHECKOUT_PROFILE_ERROR_CODES = [
  "PROFILE_FIRST_NAME_MISSING",
  "PROFILE_LAST_NAME_MISSING",
  "PROFILE_EMAIL_MISSING",
] as const;

export type CheckoutProfileErrorCode =
  (typeof CHECKOUT_PROFILE_ERROR_CODES)[number];

type CheckoutIdentityInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
};

function normalizedText(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function legacyNameParts(value?: string | null) {
  const fullName = normalizedText(value);
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length < 2) {
    return { fullName, firstName: "", lastName: "" };
  }
  return {
    fullName,
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || "",
  };
}

export function evaluateCheckoutIdentity(input: CheckoutIdentityInput) {
  const storedFirstName = normalizedText(input.firstName);
  const storedLastName = normalizedText(input.lastName);
  const legacy = legacyNameParts(input.fullName);
  const firstName = storedFirstName || legacy.firstName;
  const lastName = storedLastName || legacy.lastName;
  const email = normalizedText(input.email).toLocaleLowerCase("en-US");
  const missingFields: CheckoutProfileErrorCode[] = [];

  if (!firstName) missingFields.push("PROFILE_FIRST_NAME_MISSING");
  if (!lastName) missingFields.push("PROFILE_LAST_NAME_MISSING");
  if (!email) missingFields.push("PROFILE_EMAIL_MISSING");

  return {
    eligible: missingFields.length === 0,
    missingFields,
    customer: {
      firstName,
      lastName,
      fullName:
        storedFirstName && storedLastName
          ? `${storedFirstName} ${storedLastName}`
          : legacy.fullName
            || [firstName, lastName].filter(Boolean).join(" "),
      email,
    },
    identitySource:
      storedFirstName && storedLastName
        ? ("SEPARATE_FIELDS" as const)
        : legacy.firstName && legacy.lastName
          ? ("LEGACY_FULL_NAME" as const)
          : ("INCOMPLETE" as const),
  };
}
