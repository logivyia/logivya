export type EmailProviderName = "resend" | "smtp" | "none";

export type EmailProviderStatus = {
  configured: boolean;
  provider: EmailProviderName;
  missingVariables: string[];
  fromConfigured: boolean;
  from?: string;
};

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function smtpPortIsValid(value: string | undefined) {
  const port = Number(value?.trim());
  return Number.isInteger(port) && port > 0;
}

export function getEmailProviderStatus(): EmailProviderStatus {
  if (present(process.env.RESEND_API_KEY)) {
    const from = process.env.EMAIL_FROM?.trim();
    const missingVariables = [!from && "EMAIL_FROM"].filter(Boolean) as string[];
    return {
      configured: missingVariables.length === 0,
      provider: "resend",
      missingVariables,
      fromConfigured: Boolean(from),
      from,
    };
  }

  const missingVariables = [
    !present(process.env.SMTP_HOST) && "SMTP_HOST",
    !smtpPortIsValid(process.env.SMTP_PORT) && "SMTP_PORT",
    !present(process.env.SMTP_USER) && "SMTP_USER",
    !present(process.env.SMTP_PASS) && "SMTP_PASS",
    !present(process.env.SMTP_FROM) && "SMTP_FROM",
    !present(process.env.SMTP_SECURE) && "SMTP_SECURE",
  ].filter(Boolean) as string[];

  if (missingVariables.length === 0) {
    return {
      configured: true,
      provider: "smtp",
      missingVariables,
      fromConfigured: true,
      from: process.env.SMTP_FROM?.trim(),
    };
  }

  return {
    configured: false,
    provider: "none",
    missingVariables,
    fromConfigured: present(process.env.SMTP_FROM) || present(process.env.EMAIL_FROM),
    from: process.env.EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim(),
  };
}
