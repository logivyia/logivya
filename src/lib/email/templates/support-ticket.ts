type SupportEmailVariables = Record<string, string>;

export type SupportEmailContent = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function value(variables: SupportEmailVariables, key: string, fallback = "-") {
  return variables[key]?.trim() || fallback;
}

function safeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function field(label: string, content: string) {
  return `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-weight:600">${escapeHtml(content)}</td></tr>`;
}

function shell(input: {
  heading: string;
  intro: string;
  fields: Array<[string, string]>;
  messageLabel: string;
  message: string;
  openUrl: string;
  buttonLabel: string;
}) {
  const rows = input.fields.map(([label, content]) => field(label, content)).join("");
  const link = safeUrl(input.openUrl);
  const button = link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:6px">${escapeHtml(input.buttonLabel)}</a></p>`
    : "";

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827;line-height:1.55">
    <h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.heading)}</h1>
    <p style="margin:0 0 18px;color:#4b5563">${escapeHtml(input.intro)}</p>
    <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 20px">${rows}</table>
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;background:#f9fafb">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase">${escapeHtml(input.messageLabel)}</p>
      <div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(input.message)}</div>
    </div>
    ${button}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">Logivya</p>
  </div>`;
}

function textBlock(input: {
  intro: string;
  fields: Array<[string, string]>;
  messageLabel: string;
  message: string;
  openUrl: string;
}) {
  return [
    input.intro,
    "",
    ...input.fields.map(([label, content]) => `${label}: ${content}`),
    "",
    `${input.messageLabel}:`,
    input.message,
    ...(safeUrl(input.openUrl) ? ["", `Open: ${safeUrl(input.openUrl)}`] : []),
  ].join("\n");
}

export function supportCreatedEmail(variables: SupportEmailVariables): SupportEmailContent {
  const ticketNumber = value(variables, "ticketNumber");
  const ticketSubject = value(variables, "ticketSubject");
  const fields: Array<[string, string]> = [
    ["Ticket", ticketNumber],
    ["Subject", ticketSubject],
    ["User", value(variables, "userName")],
    ["Email", value(variables, "userEmail")],
    ["Company", value(variables, "companyName")],
    ["Category", value(variables, "ticketCategory")],
    ["Priority", value(variables, "ticketPriority")],
    ["Created", value(variables, "createdAt")],
  ];
  const message = value(variables, "message");
  const openUrl = value(variables, "openUrl", "");
  const intro = "A new support ticket has been created.";
  return {
    subject: `[Logivya Support] New ticket ${ticketNumber} - ${ticketSubject}`,
    html: shell({
      heading: "New support ticket",
      intro,
      fields,
      messageLabel: "User message",
      message,
      openUrl,
      buttonLabel: "Open ticket",
    }),
    text: textBlock({ intro, fields, messageLabel: "User message", message, openUrl }),
  };
}

export function supportReplyEmail(variables: SupportEmailVariables): SupportEmailContent {
  const ticketNumber = value(variables, "ticketNumber");
  const ticketSubject = value(variables, "ticketSubject");
  const eventKind = value(variables, "eventKind", "admin_reply");
  const isUserReply = eventKind === "user_reply";
  const isStatusChange = eventKind === "status_changed";
  const heading = isUserReply
    ? "New user reply"
    : isStatusChange
      ? "Support ticket updated"
      : "New reply from Logivya Support";
  const intro = isUserReply
    ? "A user replied to a support ticket."
    : isStatusChange
      ? "The status of your support ticket has changed."
      : "The Logivya support team replied to your ticket.";
  const messageLabel = isUserReply ? "User reply" : isStatusChange ? "Update" : "Administrator reply";
  const fields: Array<[string, string]> = [
    ["Ticket", ticketNumber],
    ["Subject", ticketSubject],
    ["Status", value(variables, "ticketStatus")],
    ...(isUserReply ? [
      ["User", value(variables, "userName")],
      ["Email", value(variables, "userEmail")],
      ["Company", value(variables, "companyName")],
    ] as Array<[string, string]> : []),
    ["Updated", value(variables, "createdAt")],
  ];
  const message = value(variables, "message");
  const openUrl = value(variables, "openUrl", "");
  return {
    subject: `[Logivya Support] ${heading} ${ticketNumber} - ${ticketSubject}`,
    html: shell({
      heading,
      intro,
      fields,
      messageLabel,
      message,
      openUrl,
      buttonLabel: "Open conversation",
    }),
    text: textBlock({ intro, fields, messageLabel, message, openUrl }),
  };
}
