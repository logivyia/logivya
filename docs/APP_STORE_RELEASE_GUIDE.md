# App Store Release Guide

## Apple Developer Kurulumu

- Bundle identifier: `com.logivya.mobile`
- App name: Logivya
- Category: Business
- Sign-in account required for review if app login-gated.

## TestFlight

1. EAS iOS build oluştur.
2. App Store Connect'e yükle.
3. Internal testers ile smoke test yap.
4. External TestFlight için beta review gönder.

## App Review Hazırlığı

Review notes içinde şunlar yer almalı:

- Test kullanıcı bilgileri.
- WhatsApp bağlantı ekranının amacı.
- Bildirimlerin hangi durumlarda gönderildiği.
- Abonelik ekranının ödeme akışı içermediği, sadece durum gösterdiği.

## Privacy Manifest

Uygulama şu veri türlerini kullanır:

- User identifiers
- Contact info
- Diagnostics
- Push notification token
- App interaction events

Kullanılmayan izinler talep edilmemelidir.

## Screenshots

- iPhone 6.7 inch
- iPhone 6.5 inch
- iPhone 5.5 inch gerekirse
- iPad opsiyonel

## Release Süreci

1. TestFlight internal test.
2. External beta test.
3. Review metadata tamamlanır.
4. Privacy policy ve support URL doğrulanır.
5. Staged release yapılır.

## Zorunlu Environment

- `MOBILE_IOS_UPDATE_URL`
- `MOBILE_CURRENT_VERSION`
- `MOBILE_MINIMUM_VERSION`
- `MOBILE_FORCE_UPDATE`
