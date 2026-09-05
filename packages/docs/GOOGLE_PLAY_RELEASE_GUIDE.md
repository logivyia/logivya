# Google Play Release Guide

## Play Console Kurulumu

- Uygulama adı: Logivya
- Paket adı: `com.logivya.mobile`
- Kategori: Business / Productivity
- Default language: Turkish
- Contact email: support@logivya.com

## Closed Test Kurulumu

1. Play Console > Testing > Closed testing bölümüne gir.
2. Tester e-posta listesi veya Google Group ekle.
3. Production imzalı AAB yükle.
4. Release notes ekle.
5. Review'a gönder.

## Data Safety Form

Toplanan veri kategorileri:

- Account info: name, email, phone.
- Company info: company name, subscription state.
- App activity: login, messaging, support and notification events.
- Device identifiers: push token, device id, app version.
- Diagnostics: crash/error telemetry if Sentry/Firebase enabled.

Veri amacı:

- Account management
- App functionality
- Security and fraud prevention
- Customer support
- Analytics and product improvement

## Privacy Policy

Privacy Policy URL production domain üzerinde erişilebilir olmalı:

- `https://www.logivya.com/privacy-policy`
- `https://www.logivya.com/kvkk`

## Görsel Assetler

- App icon: 512x512 PNG
- Feature graphic: 1024x500 PNG
- Phone screenshots: minimum 2, önerilen 6-8
- Tablet screenshots: opsiyonel ama önerilir

## Production Rollout

1. Closed test en az 14 gün ve yeterli tester aktivitesi.
2. Kritik hatalar kapatılır.
3. Version policy production değerleri güncellenir.
4. Staged rollout yüzde 5 ile başlatılır.
5. Crash/log monitoring 24 saat izlenir.

## Zorunlu Environment

- `MOBILE_CURRENT_VERSION`
- `MOBILE_MINIMUM_VERSION`
- `MOBILE_RECOMMENDED_VERSION`
- `MOBILE_FORCE_UPDATE`
- `MOBILE_ANDROID_UPDATE_URL`
