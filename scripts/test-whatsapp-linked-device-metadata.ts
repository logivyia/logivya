import assert from "node:assert/strict";
import { resolveWhatsAppLinkedDeviceMetadata } from "../src/worker/whatsapp-linked-device-metadata";

const defaultMetadata = resolveWhatsAppLinkedDeviceMetadata({});
assert.deepEqual(defaultMetadata.browser, ["Ubuntu", "Chrome", "22.04.4"]);
assert.equal(defaultMetadata.companionPlatformDisplay, "Chrome (Ubuntu)");
assert.equal(defaultMetadata.usedFallbackName, false);

const brandedMetadata = resolveWhatsAppLinkedDeviceMetadata({
  WHATSAPP_LINKED_DEVICE_NAME: "LOGIVYA",
  WHATSAPP_PAIRING_BROWSER_OS: "ubuntu",
});
assert.deepEqual(brandedMetadata.browser, ["Ubuntu", "LOGIVYA", "22.04.4"]);
assert.equal(brandedMetadata.companionPlatformDisplay, "LOGIVYA (Ubuntu)");
assert.equal(brandedMetadata.companionPlatformId, "1");

const legacyMetadata = resolveWhatsAppLinkedDeviceMetadata({
  WHATSAPP_PAIRING_BROWSER_NAME: "Chrome",
  WHATSAPP_PAIRING_BROWSER_OS: "windows",
});
assert.deepEqual(legacyMetadata.browser, ["Windows", "Chrome", "10.0.22631"]);

for (const unsafeName of ["LOGIVYA\nUbuntu", "<script>", "x".repeat(33)]) {
  const metadata = resolveWhatsAppLinkedDeviceMetadata({ WHATSAPP_LINKED_DEVICE_NAME: unsafeName });
  assert.equal(metadata.clientName, "Chrome");
  assert.equal(metadata.usedFallbackName, true);
  assert.equal(metadata.companionPlatformDisplay, "Chrome (Ubuntu)");
}

const unsupportedOs = resolveWhatsAppLinkedDeviceMetadata({
  WHATSAPP_LINKED_DEVICE_NAME: "LOGIVYA",
  WHATSAPP_PAIRING_BROWSER_OS: "LOGIVYA",
});
assert.deepEqual(unsupportedOs.browser, ["Ubuntu", "LOGIVYA", "22.04.4"]);
assert.equal(unsupportedOs.companionPlatformDisplay, "LOGIVYA (Ubuntu)");

console.log("WhatsApp linked-device metadata checks passed.");
