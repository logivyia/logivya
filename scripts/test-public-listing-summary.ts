import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPublicListingSummary,
  buildWhatsAppReferralMessage,
  formatPublicTonnage,
  publicVehicleDisplayName,
  redactPublicContactDetails,
  resolvePublicAdvertiserName,
} from "../src/server/freight/public-listing-summary";

assert.equal(publicVehicleDisplayName("CURTAINSIDER"), "Tenteli");
assert.equal(publicVehicleDisplayName("OPEN_TRAILER"), "Açık Kasa");
assert.equal(publicVehicleDisplayName("OTHER"), null);
assert.equal(publicVehicleDisplayName("UNKNOWN"), null);
assert.equal(publicVehicleDisplayName("invented-type"), null);

assert.equal(formatPublicTonnage({ value: 12 }), "12T");
assert.equal(formatPublicTonnage({ value: 12.5 }), "12,5T");
assert.equal(formatPublicTonnage({ min: 10, max: 20 }), "10-20T");
assert.equal(formatPublicTonnage({ value: 0 }), null);
assert.equal(
  redactPublicContactDetails("Tel: +90 539 356 51 42 · mail: owner@example.com"),
  "Tel: ••• · mail: •••",
);
assert.equal(
  redactPublicContactDetails("Yük 2026-09-02 tarihinde hazır"),
  "Yük 2026-09-02 tarihinde hazır",
);

const load = buildPublicListingSummary({
  id: "load-1",
  kind: "LOAD",
  source: "WHATSAPP",
  companyName: "Burak İDİM",
  explicitCompanyName: "Örnek Lojistik",
  origin: "Mersin",
  destination: "İstanbul",
  trailerType: "CURTAINSIDER",
  tonnage: 20,
  vehicleCount: 2,
  description: "Gıda yükü",
  contactPhone: "+905550001122",
  publicListingUrl: "https://logivya.com/ilan/load-1",
});
assert.equal(load.publicTitle, "Mersin → İstanbul Tenteli");
assert.equal(load.publicAdvertiserName, "Örnek Lojistik");
assert.equal(load.tonnageDisplay, "20T");
assert.equal(load.vehicleCountDisplay, "2 araç");
assert.equal(load.sourcePlatformDisplay, "WhatsApp");
assert.equal(load.canCall, true);
assert.match(load.whatsappPrefilledMessage ?? "", /^Merhaba, logivya\.com'da yer alan “Mersin → İstanbul, 20T, Tenteli” yük ilanınız için yazıyorum\./u);
assert.match(load.whatsappPrefilledMessage ?? "", /\n\nhttps:\/\/logivya\.com\/ilan\/load-1/u);

const redactedLoad = buildPublicListingSummary({
  id: "load-2",
  kind: "LOAD",
  source: "WHATSAPP",
  origin: "Ankara",
  destination: "İzmir",
  description: "İletişim +905393565142 veya owner@example.com",
  contactPhone: "+905393565142",
});
assert.equal(redactedLoad.publicDescription, "İletişim ••• veya •••");
assert.equal(redactedLoad.canCall, true, "Contact actions must remain available after public summary redaction");

assert.equal(resolvePublicAdvertiserName({ source: "WHATSAPP", companyName: "Burak IDIM" }), "WhatsApp İlanı");
assert.equal(resolvePublicAdvertiserName({ source: "LOGIVYA", companyName: "Nakliyeci AŞ" }), "Nakliyeci AŞ");
assert.equal(resolvePublicAdvertiserName({ source: "TELEGRAM", companyName: "Internal Admin" }), "Telegram İlanı");

const publicSourceMetadata = readFileSync(
  resolve("src/server/freight/public-source-metadata.ts"),
  "utf8",
);
assert.equal(
  publicSourceMetadata.includes("group.name"),
  false,
  "Unapproved private WhatsApp group names must not become public advertiser names",
);

const unsafeUrlMessage = buildWhatsAppReferralMessage({
  listingSummary: "Ankara → İzmir",
  kind: "VEHICLE",
  publicListingUrl: "https://evil.example/listing/1",
});
assert.equal(unsafeUrlMessage, "Merhaba, logivya.com'da yer alan “Ankara → İzmir” araç ilanınız için yazıyorum.");
assert.equal(unsafeUrlMessage.includes("gönder"), false);

console.log("public listing summary tests passed");
