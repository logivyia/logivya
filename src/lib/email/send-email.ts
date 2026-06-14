import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

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

export async function sendEmail(input: EmailInput) {
  const { config, transport } = createTransport();
  const result = await transport.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return { providerId: result.messageId };
}
