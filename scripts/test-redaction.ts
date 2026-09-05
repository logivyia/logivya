import assert from "node:assert/strict";
import { maskEmail, maskIpAddress, maskPhone, redactSensitive, sanitizeLogMetadata, sanitizeLogText } from "@logivya/logging";

const canaries = ["TEST_PASSWORD_SECRET", "TEST_ACCESS_TOKEN_SECRET", "TEST_TOTP_SECRET", "TEST_WHATSAPP_CREDS_SECRET"];
const circular: Record<string, unknown> = { password: canaries[0] };
circular.self = circular;
const input = {
  password: canaries[0],
  accessToken: canaries[1],
  totpSecret: canaries[2],
  credentials: { value: canaries[3] },
  authorization: `Bearer ${canaries[1]}`,
  email: "burakidim@gmail.com",
  phoneNumber: "+905551234567",
  ipAddress: "192.168.10.99",
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
  messageBody: "private customer message",
  contactJid: "905551234567@s.whatsapp.net",
  url: "https://example.com/callback?token=TEST_ACCESS_TOKEN_SECRET#secret",
  circular,
};
const output = redactSensitive(input);
const serialized = JSON.stringify(output);
for (const secret of canaries) assert(!serialized.includes(secret), `Secret leaked: ${secret}`);
assert.equal(output.email, "b***@gmail.com");
assert.equal(output.phoneNumber, "[REDACTED_PHONE]");
assert.equal(output.ipAddress, "192.168.*.*");
assert.equal(output.messageBody, "[REDACTED]");
assert.equal(output.contactJid, "[REDACTED]");
assert.equal(output.url, "https://example.com/callback");
assert.equal(maskEmail("alex@example.com"), "a***@example.com");
assert.match(maskPhone("+905551234567") || "", /4567$/);
assert.equal(maskIpAddress("10.20.30.40"), "10.20.*.*");
assert.equal(sanitizeLogText("TEST_ACCESS_TOKEN_SECRET", 80), "[REDACTED]");
assert.equal(sanitizeLogText("recipient +90 555 123 45 67", 80), "recipient [REDACTED_PHONE]");
assert.equal(sanitizeLogText("905551234567@s.whatsapp.net", 80), "[REDACTED_JID]");
assert.equal(sanitizeLogText("createdAt 2026-07-23T14:35:48.000Z", 80), "createdAt 2026-07-23T14:35:48.000Z");
assert.doesNotThrow(() => sanitizeLogMetadata(circular));
process.stdout.write("Redaction, masking, URL scrubbing and canary-secret tests passed.\n");
