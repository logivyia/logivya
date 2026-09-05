# V138 Dashboard and Mobile Security Release

Planned versions:

- Android: `versionCode 138`, `versionName 1.0.108`
- iOS: `CFBundleVersion 138`, App Store marketing version `1.0`
- Marker: `DASHBOARD_MOBILE_2FA_SECURITY_V138`

## Türkçe sürüm notları

- Mobil ana ekrandaki WhatsApp grup sayısı artık yalnızca erişilebilir ve mesaj gönderilebilir senkronize grupları gösterir.
- Professional kullanıcılar için Kişiler kartı backend abonelik yetkisine göre gösterilir.
- Abonelik ekranındaki ekip işlemi `Kullanıcıları yönet` olarak sadeleştirildi.
- Native Güvenlik ekranına 2FA kurulumu, kurtarma kodları, güvenilir cihazlar ve oturum yönetimi eklendi.
- Authenticator ve kurtarma koduyla giriş akışı web, Android ve iOS arasında eşitlendi.
- Kimlik doğrulama ve güvenlik metinlerindeki Türkçe karakterler düzeltildi.

## English release notes

- The mobile dashboard now shows only accessible, synchronized, sendable WhatsApp groups.
- Professional contact visibility is driven by the backend subscription entitlement.
- Native Security now includes TOTP enrollment, recovery codes, trusted devices, and session management.
- TOTP and recovery-code login behavior is aligned across web, Android, and iOS.
- Turkish authentication and security copy was corrected and protected by regression checks.

## Scope protection

This release does not change Baileys socket lifecycle, WhatsApp pairing, session restore, queue delivery, worker retry behavior, stored message keys, message history, or Delete for Everyone logic. Stable-core regression tests remain mandatory because authentication and mobile lifecycle code changed.

## Evidence gate

Before upload, record results for typecheck, lint, production web build, i18n validation, feature parity, enterprise MFA, subscription, contact synchronization, stable core, Prisma generation/validation, Expo Doctor, secret scan, signed AAB verification, and EAS iOS build. External provider/device tests must be reported separately from compilation evidence.

## Verified release evidence

- Production deployment: `https://logivya-lvdltq8jg-logivya.vercel.app`, aliased to `https://www.logivya.com`
- Production health: `/api/health` returned HTTP `200`; `/login` returned UTF-8 HTML with HTTP `200`
- Protected mobile bootstrap: unauthenticated `/api/mobile/bootstrap` returned HTTP `401` as required
- Production database integrity: `43` migrations complete, `215` foreign keys checked, no missing indexes, duplicates, or cross-tenant ownership findings
- Android artifact: `logivya-v138-1.0.108-dashboard-mobile-2fa-security-play-updateable.aab`
- Android SHA-256: `518029FCAE135A94311D01D00B3907C14FD841F46EBE1BA6399FD49019DDCA02`
- Android verification: package `com.logivya.mobile`, version `138 / 1.0.108`, min SDK `24`, target SDK `36`, four ABIs, signed bundle, HTTPS production API, cleartext disabled
- iOS EAS build: `944717da-2526-4ad3-bc78-c616a5d6c39e`, status `FINISHED`, version `1.0 (138)`
- iOS artifact: `https://expo.dev/artifacts/eas/tgyKFm6U84ErOs7jUQWzFqTA1-XP6wcWsqMUK3QqYF8.ipa`

Automated gates passed: Prisma generate/validate, root and mobile typecheck, lint, production web build, Expo Doctor `17/17`, tracked secret scan, production dependency audit, enterprise MFA, mobile dashboard/security parity, subscriptions, WhatsApp contact integration, stable-core regression, feature parity, baseline suite, migration safety, database integrity, Android bundle build, Android release verification, and iOS preflight/build.

## Store delivery evidence

- Google Play closed-test release: `138 (1.0.108)`, release draft `4`
- Google Play submission result: accepted into review on 20 July 2026; Play Console confirmed `1 degisiklik incelemeye gonderildi`
- Google Play device coverage: phones `12,302`, tablets `6,590`, TV `4`, automotive `9`, Chromebook `72`, Android XR `1`; unsupported-device delta `0` for every form factor
- Google Play non-blocking warning: no deobfuscation mapping file was attached. The signed bundle includes native debug symbols; this warning does not block closed-test review.
- EAS iOS build: `944717da-2526-4ad3-bc78-c616a5d6c39e`, `1.0 (138)`, `FINISHED`
- EAS iOS submission: `190f7e87-4249-41e3-bbea-2ae16fbe6c51`, server-side status `IN_QUEUE`, no error, submitted build `1.0 (138)`
- App Store Connect API: build `138` is not listed yet because the EAS submission has not started the Apple upload worker. Builds `137` and `136` remain `VALID`.
- The local `eas submit --wait` process was stopped after the server-side submission record was verified. The remote EAS submission remains queued independently.

External/manual evidence remains separate: authenticated real-device Android and iOS journeys, worker/Redis live-provider evidence, and store-side review/processing status. Compilation and upload evidence must not be used as a substitute for those checks.
