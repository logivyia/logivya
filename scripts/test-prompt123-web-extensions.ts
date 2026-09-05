import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function includes(path: string, ...needles: string[]) {
  const value = source(path);
  for (const needle of needles) {
    assert.ok(
      value.includes(needle),
      `${path} must include ${JSON.stringify(needle)}`,
    );
  }
  return value;
}

const access = includes(
  "src/server/web/communication-access.ts",
  "requireApiSession",
  "MobilePlatform.WEB",
  "resolveTelegramAccessAudience",
  "resolveFacebookPagesAccess",
);
assert.ok(
  !access.includes("requireMobileAuth"),
  "web access adapters must use the cookie session, not mobile bearer auth",
);

const telegramRoute = includes(
  "src/app/api/web/telegram/workspace/route.ts",
  "requireWebTelegramAccess",
  "listOwnedTelegramAccounts(user.id, company.id)",
  "ownerUserId: user.id",
  "companyId: company.id",
  "createTelegramDispatchSchema.safeParse",
  "createTelegramDispatch",
  "listTelegramHistory",
  "enforceOperationRateLimit",
);
assert.ok(
  !telegramRoute.includes("requireMobileAuth"),
  "Telegram web route must not depend on mobile auth",
);

const facebookRoute = includes(
  "src/app/api/web/facebook/workspace/route.ts",
  "requireWebFacebookAccess",
  "listFacebookPages(company.id, user.id)",
  "listFacebookPagePosts(company.id, user.id",
  "createFacebookPostRequestSchema.safeParse",
  "createFacebookPagePosts",
  "CompanyRole.VIEWER",
  "enforceOperationRateLimit",
);
assert.ok(
  !facebookRoute.includes("requireMobileAuth"),
  "Facebook web route must not depend on mobile auth",
);

includes(
  "src/app/(platform)/telegram/page.tsx",
  "requireSession",
  "resolveTelegramInternalAccess",
  "MobilePlatform.WEB",
  "Telegram Yönetimi",
);
includes(
  "src/app/(platform)/facebook/page.tsx",
  "requireSession",
  "resolveFacebookPagesAccess",
  "MobilePlatform.WEB",
  "Facebook Yönetimi",
);

includes(
  "src/components/telegram-management-page.tsx",
  'title: "Telegram Yönetimi"',
  'accounts: "Hesaplar"',
  'chats: "Sohbetler"',
  'compose: "Mesaj Gönder"',
  'history: "Geçmiş"',
  'role="tablist"',
  'role="tabpanel"',
);
includes(
  "src/components/facebook-management-page.tsx",
  'title: "Facebook Yönetimi"',
  'pages: "Sayfalar"',
  'compose: "Gönderi Oluştur"',
  'history: "Geçmiş"',
  'role="tablist"',
  'role="tabpanel"',
);

const lowbed = includes(
  "src/components/lowbed-icon.tsx",
  "/logivya/project-haul-icon-transparent.png",
  "owner-supplied project-haul artwork",
  'objectFit: "contain"',
  "draggable={false}",
  "aria-hidden",
  "alt={label}",
);
assert.ok(
  !lowbed.includes("<svg"),
  "lowbed icon must render the owner-supplied raster artwork without redrawing it",
);

const lowbedAsset = readFileSync(
  resolve(root, "public/logivya/project-haul-icon-transparent.png"),
);
assert.equal(
  lowbedAsset.subarray(0, 8).toString("hex"),
  "89504e470d0a1a0a",
  "lowbed artwork must be a PNG",
);
assert.equal(
  lowbedAsset.readUInt32BE(16),
  504,
  "lowbed artwork width must be the optimized 3x size",
);
assert.equal(
  lowbedAsset.readUInt32BE(20),
  168,
  "lowbed artwork height must retain the source composition",
);
assert.equal(
  lowbedAsset[25],
  6,
  "lowbed artwork must retain an RGBA alpha channel",
);
assert.equal(
  createHash("sha256").update(lowbedAsset).digest("hex"),
  "9490ea70b977d4d482c722d33ab8f9ee97df7ad6157cf63971d67afef598dd24",
  "lowbed artwork must remain the deterministic transparent derivative of the owner-supplied JPEG",
);

includes(
  "src/components/web-message-attachment-picker.tsx",
  "attachments: readonly WebMessageAttachment[]",
  "onUpload: (files: File[])",
  "onRemove: (id: string)",
  "uploading: boolean",
  "error?: string | null",
  'photo: "Fotoğraf"',
  'video: "Video"',
  'document: "Belge"',
  'role="dialog"',
  'aria-modal="true"',
  'event.key === "Escape"',
  'event.key !== "Tab"',
  "window.visualViewport",
  "safe-area-inset-bottom",
  'type="file"',
  "WEB_PHOTO_ACCEPT",
  "WEB_VIDEO_ACCEPT",
  "WEB_DOCUMENT_ACCEPT",
);

console.log("Prompt 1-3 web extension contract tests passed.");
