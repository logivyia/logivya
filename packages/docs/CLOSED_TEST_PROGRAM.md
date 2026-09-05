# Logivya Closed Test Program

## Amaç

Logivya mobil uygulamasını gerçek kullanıcı cihazlarında kontrollü şekilde doğrulamak, kritik hataları yakalamak ve Google Play kapalı test şartlarına hazır hale getirmek.

## Tester Rolleri

- Owner tester: hesap oluşturma, abonelik, şirket ayarları ve genel akışları test eder.
- Operations tester: WhatsApp bağlantısı, grup/kategori ve mesaj gönderimini test eder.
- Support tester: destek talebi, bildirimler ve profil/ayarlar akışını test eder.
- Regression tester: her yeni build sonrası temel kabul testlerini tekrarlar.

## Onboarding Süreci

1. Tester e-posta adresi Google Play Closed Testing listesine eklenir.
2. Tester, test linkinden uygulamayı yükler.
3. Tester, gerçek veya test şirket hesabı ile giriş yapar.
4. İlk oturumda bildirim izni, login, dashboard ve logout akışı doğrulanır.

## Feedback Süreci

- Uygulama içindeki Geri Bildirim ekranı kullanılmalıdır.
- Hata bildirimi için ekran, adımlar, beklenen sonuç ve gerçek sonuç yazılır.
- Özellik önerisi için kullanım senaryosu ve beklenen fayda belirtilir.
- Screenshot varsa URL olarak eklenir.

## Bug Raporlama Süreci

- Severity P0: giriş, WhatsApp bağlantısı, mesaj gönderimi veya veri güvenliği çalışmıyor.
- Severity P1: ana akış çalışıyor ancak kritik hata/çökme var.
- Severity P2: UI, çeviri, okunabilirlik veya küçük veri problemi.
- Severity P3: iyileştirme veya kozmetik öneri.

## Release Süreci

1. Build typecheck ve lint geçer.
2. Android preview APK test edilir.
3. Closed beta AAB Google Play'e yüklenir.
4. Tester listesi güncellenir.
5. Release notes paylaşılır.
6. 24-48 saat test gözlemi yapılır.

## Çıkış Kriterleri

- P0 açık hata yok.
- P1 açık hata yok veya kabul edilmiş workaround var.
- Login, WhatsApp, mesaj, destek, bildirim ve logout akışları gerçek cihazda geçer.
- Minimum desteklenen versiyon politikası çalışır.
