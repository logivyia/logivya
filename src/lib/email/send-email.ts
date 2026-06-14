import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getEmailProviderStatus, type EmailProviderStatus } from "@/lib/email/email-provider";

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SmtpDiagnostics = {
  configured: boolean;
  missing: string[];
  host?: string;
  port?: number;
  secure?: boolean;
  fromConfigured: boolean;
};

export class SmtpConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`SMTP configuration missing: ${missing.join(", ")}`);
    this.name = "SmtpConfigurationError";
  }
}

export class EmailConfigurationError extends Error {
  constructor(
    public readonly missingVariables: string[],
    public readonly providerStatus: EmailProviderStatus,
  ) {
    super(`Email configuration missing: ${missingVariables.join(", ")}`);
    this.name = "EmailConfigurationError";
  }
}

function parseSecure(value: string) {
  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

export function getSmtpDiagnostics(): SmtpDiagnostics {
  const host = process.env.SMTP_HOST?.trim();
  const rawPort = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim();
  const secureValue = process.env.SMTP_SECURE?.trim();
  const port = Number(rawPort);

  const missing = [
    !host && "SMTP_HOST",
    (!rawPort || !Number.isInteger(port) || port <= 0) && "SMTP_PORT",
    !user && "SMTP_USER",
    !pass && "SMTP_PASS",
    !from && "SMTP_FROM",
    !secureValue && "SMTP_SECURE",
  ].filter(Boolean) as string[];

  return {
    configured: missing.length === 0,
    missing,
    host: host || undefined,
    port: Number.isInteger(port) && port > 0 ? port : undefined,
    secure: secureValue ? parseSecure(secureValue) : undefined,
    fromConfigured: Boolean(from),
  };
}

function smtpConfig() {
  const diagnostics = getSmtpDiagnostics();
  if (!diagnostics.configured) {
    throw new SmtpConfigurationError(diagnostics.missing);
  }

  const from = process.env.SMTP_FROM!.trim();

  return {
    host: diagnostics.host!,
    port: diagnostics.port!,
    secure: Boolean(diagnostics.secure),
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!,
    },
    from: from.includes("<") ? from : `Logivya <${from}>`,
  };
}

function createTransport() {
  const config = smtpConfig();
  const transportOptions: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  };

  return { config, transport: nodemailer.createTransport(transportOptions) };
}

export async function verifySmtpConnection() {
  const diagnostics = getSmtpDiagnostics();
  if (!diagnostics.configured) {
    return { ok: false as const, diagnostics, errorCode: "SMTP_CONFIGURATION_MISSING" };
  }

  try {
    const { transport } = createTransport();
    await transport.verify();
    return { ok: true as const, diagnostics };
  } catch (error) {
    return {
      ok: false as const,
      diagnostics,
      errorCode: error instanceof Error ? error.message.slice(0, 180) : "SMTP_VERIFY_FAILED",
    };
  }
}

function formatFrom(value: string) {
  return value.includes("<") ? value : `Logivya <${value}>`;
}

async function sendWithResend(input: EmailInput, from: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: formatFrom(from),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`RESEND_SEND_FAILED_${response.status}${detail ? `_${detail.slice(0, 120)}` : ""}`);
  }

  const result = (await response.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend" as const, providerId: result.id };
}

async function sendWithSmtp(input: EmailInput) {
  const { config, transport } = createTransport();
  const result = await transport.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return { provider: "smtp" as const, providerId: result.messageId };
}

export async function verifyEmailProviderConnection() {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    return { ok: false as const, status, errorCode: "EMAIL_CONFIGURATION_MISSING" };
  }

  if (status.provider === "smtp") {
    const smtp = await verifySmtpConnection();
    return {
      ok: smtp.ok,
      status,
      smtp,
      errorCode: smtp.ok ? undefined : smtp.errorCode,
    };
  }

  return { ok: true as const, status, smtp: undefined, errorCode: undefined };
}

export async function sendEmail(input: EmailInput) {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    throw new EmailConfigurationError(status.missingVariables, status);
  }

  if (status.provider === "resend") {
    return sendWithResend(input, status.from!);
  }

  if (status.provider === "smtp") {
    return sendWithSmtp(input);
  }

  throw new EmailConfigurationError(status.missingVariables, status);
}
