# Apple birleşik sürüm adayı — 1.0.14 (193)

Bu klasör, önceki Apple taslaklarının ve 6 Eylül denetim düzeltmelerinin tek kaynak adayıdır. **IPA henüz üretilmedi.** Kota açıldıktan sonra aynı adaydan bir iOS build üretilecek; inceleme başvurusu kullanıcı talimatıyla yapılacak.

Apple'da 6 Eylül 2026 tarihinde salt okunur olarak doğrulanan mevcut yayın **1.0.13 (188), READY_FOR_SALE**. Yüklenmiş son taslaklar **1.0.14 (189 ve 190), VALID**. 191/192/193 numaraları önceki yerel kaynak adaylarıdır; Apple'a yüklenmiş yeni ikililer değildir.

## Tek adayın kapsamı

- Önceki yönetici, Telegram yönetimi, oturum, bildirim ve iOS güncelleme düzenlemeleri.
- Kayıt öncesi canlı ilanlar, giriş/kayıt butonları, dil seçimi ve doğru ekrana geri dönüş.
- 12 dil; Özbekçe ve Özbekistan +998 dahil 245 ülke/bölge telefon kodu. Arapça rakamlar ve Dubai/BAE gibi ülke aramaları.
- Talep yönetimi, eşleşme sayfalaması, telefon/WhatsApp iletişimi, rota/araç filtreleri.
- Güncel Telegram erişimi ve yayın tercihi ekranları; canlı ilan ve eşleşme sunucu düzenlemeleriyle uyumluluk.
- Yükleme tarihi, rota, yük cinsi, sıcaklık ve ülke adı düzeltmeleri.
- Abonelik, satın alımları geri yükleme, gizlilik, hesap yönetimi ve denetim düzeltmeleri.
- Gönderim sıralaması ve bekleme durumları. İki gönderim/sonraki gönderime beş dakika ve gruplar arası altı saniye politikası sunucudadır; yeni iOS build ayrı bir gönderim politikası oluşturmaz.

Sunucu tabanlı özellikler canlı `audit-fixes-20260906-63` sürümündedir. Sunucu uygulama kaynağı `199a4c68af3b17e3610864b3a443884f4b211212`, test edilmiş mobil çalışma zamanı kaynağı `28081acc45fec2fd3a7d578bb94552e7a58b65b1` korunmuştur. Bu birleştirmede mobil çalışma zamanı kodu değiştirilmedi; iOS profilleri ve mağaza metinleri hizalandı.

`draft-provenance.json` eski kaynakların karşılaştırmasını, `source-manifest.json` tüm yerel mobil girdilerin SHA-256 değerlerini içerir. Eski IPA dosyaları geçmiş kanıt olarak korunur. 189/190/191/192 ayrıca derlenmeyecek; tek yeni aday 193'tür.

## Kullanılacak çalışma alanı ve ayar

- Çalışma alanı: `C:/logivya-ios-unified-193`
- Git dalı: `codex/ios-unified-193`
- Tek ana profil: `ios-production`
- `ios-testflight-internal` aynı profilin ayarsız takma adıdır; eski 177 sürümüne dönmez.
- Sürüm/build: `1.0.14 / 193`, otomatik artırım kapalı.
- İşaret: `IOS_UNIFIED_V193`; kimlik: `ios-v193-1.0.14-unified`.
- Uygulama: `com.logivya.mobile`, App Store ID `6792539737`.
- `LOGIVYA_GIT_COMMIT` çalışma zamanı/sunucu temelini gösterir. Kaynak arşivini tanımlayan son Git commit ve arşiv özeti ayrıca teslim manifestindedir; bunlar birbirinin yerine kullanılmaz.

## Kota açılınca tek build için devam

1. Bu dalın teslim manifestindeki sabit commit'ini açın. Ana masaüstü klasöründeki eski, değiştirilmiş çalışma ağacından derlemeyin.
2. Salt okunur EAS kota ve App Store sürüm/build kontrolü yapın. Build 193 daha önce başlamış veya yüklenmişse önce mevcut işi/binary'yi bulun; ikinci bir build başlatmayın. Numara çakışması varsa manifesti sessizce değiştirmeyin.
3. Temiz kurulum gerekiyorsa kökte ve `apps/mobile` altında kilitli bağımlılıklarla `npm ci` çalıştırın. Git dışındaki `GoogleService-Info.plist`, `credentials.json` ve imzalama dosyalarını mevcut güvenli yerel kaynaktan geri yükleyin. Özel anahtarlar kaynak arşivinde değildir. Firebase dosyasını manifestteki SHA-256 ile doğrulayın; imzalama geçerliliğini yeniden kontrol edin.
4. `node scripts/apple/verify-unified-ios-source.mjs` ve `node scripts/apple/validate-eas-ios.mjs` çalıştırın. İlk komut yalnızca doğrular; build veya gönderim başlatmaz.
5. Mevcut build ön kontrolü App Store'da 1.0.14 sürüm kaydı ister. Kayıt hâlâ yoksa yalnızca boş sürüm taslağını hazırlayın; kabul edilen 1.0.13'ü değiştirmeyin ve eski 190'ı yeni aday diye bağlamayın. Sonra `ios-preflight.mjs --new-build` çalıştırın.
6. Kullanıcının build zamanı talimatından sonra korumalı `build-approved-ios.mjs` üzerinden **yalnızca bir `ios-production` build** başlatın. Komut auto-submit içermez. EAS iş kimliğini hemen kaydedin; bağlantı kesilirse aynı işin durumunu okuyarak devam edin.
7. IPA oluşunca kimlik/sürüm, imza, provisioning, APNs, privacy manifest, gömülü kaynak bilgisi ve hash kontrolü yapın. Fiziksel iPhone/iPad'de açılış, giriş, dil, ilan → talep → eşleşme → iletişim, bildirim ve StoreKit sandbox/Restore kabulünü tamamlayın. Gerçek kişilere test mesajı göndermeyin.
8. Doğrulanan **aynı IPA** Apple'a yüklenip 1.0.14 taslağına bağlanabilir. App Review/üretim başvurusu için kullanıcının sonraki talimatını bekleyin.

## Doğrulamanın sınırı

Yerel iOS Hermes paketlemesi ve tip kontrolü başarılıdır; bu çıktı imzalı IPA değildir. Fiziksel iPhone/iPad, gerçek üçüncü taraf hesap bağlantısı/grup alımı, StoreKit sandbox ve son imzalı IPA kabulü henüz yapılmamıştır. Önceki rapordaki bağımsız felaket kurtarma ve WhatsApp bağlantı kuyruğu işletim konuları bu kaynak birleştirmesiyle kapanmış sayılmaz.

Kota/inceleme otomasyonu kurulmadı, ücretli paket alınmadı, EAS native build başlatılmadı, Apple'a binary veya inceleme başvurusu gönderilmedi.
