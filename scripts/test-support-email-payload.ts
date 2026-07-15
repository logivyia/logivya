import assert from "node:assert/strict";
import { supportCreatedEmail, supportReplyEmail } from "../src/lib/email/templates/support-ticket";

const baseVariables = {
  locale: "tr",
  ticketNumber: "LOG-2026-ABC123",
  ticketSubject: "Bağlantı <sorunu>",
  ticketCategory: "WHATSAPP_CONNECTION",
  ticketPriority: "NORMAL",
  ticketStatus: "WAITING_FOR_ADMIN",
  userName: "Test Kullanıcı",
  userEmail: "user@example.com",
  companyName: "Test & Company",
  createdAt: "2026-07-15T12:00:00.000Z",
  message: "İlk satır\n<script>alert('x')</script>\nSon satır",
  openUrl: "https://www.logivya.com/admin/support/LOG-2026-ABC123",
};

const created = supportCreatedEmail(baseVariables);
assert.match(created.subject, /LOG-2026-ABC123/);
assert.match(created.subject, /Bağlantı/);
assert.match(created.text, /user@example\.com/);
assert.match(created.text, /İlk satır\n<script>/);
assert.match(created.html, /İlk satır\n&lt;script&gt;/);
assert.doesNotMatch(created.html, /<script>/);
assert.match(created.html, /Test &amp; Company/);
assert.match(created.html, /https:\/\/www\.logivya\.com\/admin\/support/);

const adminReply = supportReplyEmail({
  ...baseVariables,
  eventKind: "admin_reply",
  ticketStatus: "WAITING_FOR_USER",
  message: "Merhaba, bağlantıyı yeniden doğruladık.",
  openUrl: "https://www.logivya.com/support/LOG-2026-ABC123",
});
assert.match(adminReply.subject, /LOG-2026-ABC123/);
assert.match(adminReply.text, /Merhaba, bağlantıyı yeniden doğruladık\./);
assert.match(adminReply.html, /WAITING_FOR_USER/);
assert.match(adminReply.html, /https:\/\/www\.logivya\.com\/support/);

const userReply = supportReplyEmail({ ...baseVariables, eventKind: "user_reply", message: "Kullanıcı yanıtı" });
assert.match(userReply.html, /user@example\.com/);
assert.match(userReply.text, /Kullanıcı yanıtı/);

const unsafeLink = supportReplyEmail({ ...baseVariables, eventKind: "admin_reply", openUrl: "javascript:alert(1)" });
assert.doesNotMatch(unsafeLink.html, /javascript:/);

console.log(JSON.stringify({ ok: true, htmlEscaping: true, plainText: true, ticketContent: true, replyContent: true }));
