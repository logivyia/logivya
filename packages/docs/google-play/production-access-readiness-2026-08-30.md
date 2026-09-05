# Google Play üretime erişim hazırlığı — 30 Ağustos 2026

## Sonuç

Üretime erişim başvurusu **gönderilmedi**. Console'da başvuru koşulları
tamamlanmış ve başvuru düğmesi açık. Bu, kalite kontrollerinin tamamlandığı
veya uygulamanın üretimde yayımlandığı anlamına gelmez.

**17:55 güncellemesi:** Kullanıcının açık metin onayıyla ücretli test beyanı
ve doğrulanabilir sonuçlar Chrome'daki açık başvuru formunun dört bölümüne
işlendi, Geri/İleri ile tekrar okundu. Ancak bağımsız bir sekmede yeniden
açılan form eski yanlış beyanı gösterdi. Bu nedenle **kalıcı taslak kaydı
doğrulanmadı**. Düzeltilmiş form açık bırakıldı; son **Uygula** düğmesine
basılmadı. Aşağıdaki yerel yanıtlar, açık formun doğrulanmış kopyasıdır.
Google lansman öncesi raporu ve uzun süreli çalışma kabulü hâlâ açık kapıdır;
bu işlem bunları tamamlamaz.

Yeni yerel Android adayı: **203 / 1.0.188**. Son `lint-privacy-qa.aab`,
klavye/alt menü ve bağımlılık/manifest düzeltmelerini içeriyor. Birleşik
`:app:lintRelease :app:bundleRelease` komutu başarıyla tamamlandı:
**tam Android lint 0 hata, 22 uyarı; son paket doğrulaması 31/31**.
16:45 itibarıyla aynı SHA-256 ile **yalnızca dahili test kanalına** yüklendi.
Kapalı test 198 ve üretim kanalı değiştirilmedi. 203 telefona Play Store'dan
kuruldu; aşağıdaki gerçek cihaz kontrolleri tamamlandı. Bu sınırlı QA,
final üretim kabulü veya canlı gelen mesaj aktarımı kanıtı değildir.
30 Ağustos 14:53–14:57 arasında USB ile bağlanan Samsung A16 üzerinde,
Play Store'dan kurulu **202 / 1.0.187** için sınırlı cihaz kontrolü yapıldı;
klavye ve alt menü yerleşim sorunları görüldü. Bu sonuçlar 203'e aktarılamaz.
Kaynak ağacındaki mevcut kullanıcı değişiklikleri korunmuştur; toplu commit
veya reset yapılmamıştır. 16:12, 16:17 ve 16:41'de üç dar kapsamlı worker
düzeltmesi canlıya alınmıştır. 17:11'de ana hesabın onaylı kaynağı için
sınırlı bir pending-delivery canary, 17:18'de aynı canary için protokol ACK
düzeltmesi başlatıldı. Son düzeltmeyle gerçek telefon mesajları alındı.
17:35'te yeni çevrimiçi test yükünün otomatik yayını ve 17:36'da kaynaktan
silinince otomatik pasifleştirilmesi ayrıca doğrulandı. Web/üretim Android
yayını veya veritabanı migration'ı yapılmamıştır.

Ana WhatsApp hesabı kullanıcının açık onayıyla yeniden bağlandı; beş mevcut
onaylı kaynak artık bağlı hesaba aittir. Gerçek mesaj gönderme ve Herkesten
Sil işlemleri üç test mesajında kullanıcı tarafından doğrulandı. Ancak
yeniden başlatma sonrası dördüncü mesajın canlı ilan işlem hattına ulaşmadığı
görüldü. Canlı olay tamponu 16:41'de düzeltildi. Beşinci gerçek teknik mesajın
işlenmesi ve kaynakta silinmesinin sisteme yansıması doğrulandı. Gerçek yük
ilanının yayımlanma/pasifleştirme testi 17:35–17:36'da ayrıca tamamlandı;
önceki teknik mesajlar bu testin yerine sayılmadı.
Kullanıcının telefondan yazdığı iki Mersin–İstanbul mesajı 17:18'de alındı.
Doğru yazılmış ikinci mesaj 20 ton/tenteli olarak çözümlendi. Eksik iletişim
telefonu kullanıcının ayrı açık onayıyla tamamlandı ve 17:22'de **MANUEL**
yayımlandı. İnceleme hesabında normal kullanıcı pazar erişiminin kapalı
olduğu saptandı; kullanıcının ayrı onayıyla 17:27'de normal kullanıcı erişimi
açıldı. İnceleme hesabına yönetici yetkisi verilmedi.
**Üretime hazır kararı verilmedi. Son başvuru düğmesine basılmadı.**

## Son doğrulama — 30 Ağustos 17:47

### Gerçek kaynak silmesi ve otomatik yayın zinciri — PASS

- Kullanıcı kendi telefonunda görünen ilk yükü WhatsApp'tan sildiğini ve
  Logivya'dan da kalktığını doğruladı. İlk manuel test ilanı
  `cmtfwfr6s00018qmt1by4we4i`, `14:33:37.106Z` itibarıyla INACTIVE;
  kaynak/extraction DELETED_AT_SOURCE ve aktif feed'de yok. Doğrudan
  veritabanı pasifleştirmesi yapılmadı.
- Ardından yalnızca önceden izin verilen iki kişilik aynı test grubunda,
  iki yetkili hesap arasında **yeni, açıkça test etiketli** Mersin–İstanbul,
  20 ton tenteli yük gönderildi. İletişim telefonu için önceki ayrı açık
  kullanıcı onayı kullanıldı. Mesaj gerçek ticari yük gibi sunulmadı.
- Normal gönderim kuyruğunun kampanyası `cmtfww5a5000201mtdiyhb1so`:
  gönderim `14:35:44.978Z`, ana hesap alımı `14:35:45.125Z`.
- Inbound `cmtfwwaqt01cv07mt1t7sgm9m`; extraction
  `cmtfwwayd009h07s1uodltg1d`: **AUTO_PUBLISHED**, güven 100,
  yayın `14:35:45.517Z`. İlan `cmtfwwb1d009m07s1bsq7ss6w`
  ACTIVE olarak normal feed yanıtında doğrulandı. Alım–yayın yaklaşık
  **392 ms**. Manuel yayın, yapay inbound veya doğrudan extraction yazımı yok.
- Aynı test mesajı normal Herkesten Sil servisiyle kaldırıldı. Silme talebi
  `14:36:06.237Z`, ilanın pasifleştirilmesi `14:36:06.696Z`.
  Alıcı deleteStatus DELETED, kaynak/extraction DELETED_AT_SOURCE,
  ilan INACTIVE, aktif feed sonucu boş. 17:44 salt okunur kontrolde tekrar
  doğrulandı. WhatsApp silmesi geri alınamaz; Logivya'da pasif denetim kaydı kalır.
- Bu test bir onaylı grubun uçtan uca kanıtıdır; bütün grupların, bütün mesaj
  biçimlerinin veya sürekli uzun dönem çalışmanın garantisi değildir.

### Normal kurulum zinciri — yerelde tamamlandı, yeni canlı dağıtım yapılmadı

- Pending-delivery ve ACK yamaları `package.json` postinstall zincirine,
  `Dockerfile.worker` ve `ops/vps/Dockerfile.worker` kurulumlarına eklendi.
  Kurulum iki kez çalıştırıldı; ikinci çalışmada tüm yamalar değişmeden
  zaten uygulanmış olarak doğrulandı. Baileys sürümü yükseltilmedi.
- `pending-delivery-policy.ts`, sabit müşteri hesabı yerine etkin global
  kontrol + doğru hesap/sahip/şirket + arşivlenmemiş, açıkça onaylı/etkin ve
  duraklatılmamış kaynak koşullarını uygular. Hata halinde kapalı kalır;
  yeni QR/telefon eşleştirmesinde bekleyen mesaj alımını açmaz. Tam sohbet
  geçmişi kapalı ve her gelen olayda mevcut sahiplik/onay filtresi korunuyor.
- Bu genel politika **yerel kaynakta** hazırdır. Canlıda kanıtlanan dar
  kapsamlı imaj 5 çalışmaya devam eder; bu bölüm sırasında yeniden başlatma,
  başka hesapları canary'ye açma, migration veya Android yüklemesi yapılmadı.
- Başarılı: `test:stable-core` (82 yürütülen node:test vakası + sözleşme
  kontrolleri), `test:whatsapp-ingestion`, `test:freight-marketplace`, web
  typecheck, mobil typecheck, web üretim derlemesi (317/317 statik sayfa),
  izlenen 1178 dosyada gizli bilgi kalıbı taraması. Tarama izlenmeyen tüm
  dosyaların ayrıca incelendiği anlamına gelmez.
- Hedefli ESLint: 0 hata, mevcut `_nameSource` değişkeni için 1 uyarı.
  Derlemede PostgreSQL istemcisinin gelecekteki SSL modu davranış uyarısı
  var; bağlantı güvenliği ayarı veya test eşikleri değiştirilmedi.
- Veritabanı sahiplik denetimindeki altı uygunsuzluk sayacı yine 0.

### Açık kalan kontroller — geçilmiş sayılmadı

- 17:42 sıkı soak: 1456/3600 saniye, 25/59 recovery; healthy, restart 0,
  bağlantı/kuyruk/recovery/fatal/Prisma timeout hataları 0. Redis toplam
  hata cevabı 31 (beklenen 0), değişmedi. Sonuç **FAIL**; sayaçlar sıfırlanmadı.
- Şifre çözme hata sayısı 17'den 19'a yükseldi. Son ikisi
  `14:36:56.885Z` ve `14:36:58.236Z`, eksik oturum sınıfında, test grubundan
  farklı gelen grup olaylarıdır. Hesap bilgisi logda yok; hangi hesaba ait
  oldukları veya sonradan kurtarıldıkları kanıtlanmadı. Özel grup adı,
  mesaj içeriği, numara ve anahtar tanı çıktısına alınmadı.
- 17:47 ek sahiplik sınırlı inceleme: yukarıdaki iki olayın grupları hem ana
  hem inceleme hesabında kaynak alımı **kapalı ve onaysız**; bu mesajlar için
  kalıcı inbound kaydı yok. `14:46:32.195Z` tarihli üçüncü yeni olay için
  yetkili iki hesapta eşleşen grup veya inbound yok. Diğer kullanıcıların
  gruplarına genişletilmiş sorgu yapılmadı. Bunlar test grubunun yayınını
  bozduğuna kanıt değildir; bütün şifre çözme hataları çözüldü de denilmedi.
- 17:44 anlık denetimde worker heartbeat taze; Redis PING sağlıklı;
  sync/message kuyruklarında waiting/active/delayed 0, campaign delayed 1.
  Saklanan failed işler sync 100/message 1; bu toplamların yeni imajda
  oluştuğu iddia edilmedi. Anlık sağlık uzun süre kabulü yerine geçmez.
- 17:47 yeniden denetim: 1731/3600 saniye, 29/59 recovery, decrypt 20,
  beklenmeyen bağlantı kapanışı 1; sıkı sonuç yine FAIL. Kapanış ana veya
  inceleme hesabında değil: `14:46:21.251Z`, kod 428, loggedOut=false.
  Aynı oturum `14:46:29.138Z` yeniden bağlanmaya başlayıp
  `14:46:32.617Z` açıldı (yaklaşık 11.4 saniye). Bu otomatik kurtarma
  kanıtıdır; bütün-hesap soak kapısını geçtiği anlamına gelmez. Ana/inceleme
  hesabını yeniden eşleştirme veya diğer oturuma müdahale yapılmadı.
- 17:45 Play Console: kapalı test **198/1.0.183**, dahili test
  **203/1.0.188**; Android 15 eski API uyarısı hâlâ **198** için listeleniyor.
  Üretime erişim koşulları yeşil ve başvuru düğmesi açık; gönderilmedi.
- Lansman öncesi rapor hâlâ “rapor oluşturmak için yapı yükleyin” diyor.
  Ayarlarda ayrı kimlik bilgisi girilmemiş; aynı sayfa App content'te
  sağlanan bilgilerin tekrar girilmesinin gerekmediğini belirtiyor.
  İnceleme kimlik bilgileri önceki adımda App content'e sağlandı; burada
  parola kopyalama veya ayar değişikliği yapılmadı.
- [Google'ın güncel açıklamasına göre](https://support.google.com/googleplay/android-developer/answer/9842757)
  rapor cihaz laboratuvarı kapasitesine bağlıdır ve birkaç saat gecikebilir.
  Bu nedenle raporun yokluğu başarı ya da kesin ret olarak yorumlanmadı;
  yalnızca rapor tetiklemek için yeni sürüm/üretim yayını yapılmadı.
- Son başvuru metnindeki ücretli test ifadesi için açık metin onayı istendi.
  Önceki araç reddi aşılmadı; form yazımı ve son gönderim yapılmadı.
- 17:50 gönderim etkinliği kontrolünde 62 numaralı, 17:05 tarihli önceki
  gönderim “Yayınlanmaya hazır” (17:16) görünüyor; ayrıntı tablosunda
  **0 değişiklik / Sonuç yok** yazıyor. Boş tablodan yeni uygulama sürümü,
  üretime erişim onayı veya bir yayın işlemi çıkarımı yapılmadı. Bu turda
  hiçbir Google başvuru/yayın düğmesine basılmadı.

## Devam kaydı — 30 Ağustos 17:29

Bu bölüm tarihçedir; yukarıdaki 17:47 kaydı sonraki testlerin güncel sonucudur.

### Gelen mesaj onayı ve gerçek kaynak mesajları

- Kurulu Baileys `handleMessage` akışında normal işlenen mesaj için protokol
  ACK eksikliği ağsız testte doğrulandı. Yeni `patch-baileys-ingestion-ack.mjs`,
  yalnızca onaylı canary hesabında işlem tamamlandıktan sonra ACK gönderir;
  eksik anahtar NACK'ini tekrarlamaz, kapanmış sokete göndermez. ACK hatası
  loguna mesaj içeriği/anahtarı eklenmez. 12 yeni testle imaj test toplamı **66**.
- İmaj `logivya-worker:ingestion-ack-20260830-5`,
  ID `sha256:da2cd298396d1794e8a1755435509670dfb0ab86ccfe27c3ab08458bd5cd9ca3`;
  başlangıç `2026-08-30T14:18:38.145572293Z`. Geri dönüş
  `deploy.sh --rollback --ingestion-ack`, önceki dördüncü imaja döner.
- `14:18:53.048Z` itibarıyla 494 bekleyen mesaj/bildirim tamamlandı.
  Canary **en çok üç adet count=100 isteği** sınırlar; sunucunun toplam
  döndüreceği olay sayısının en fazla 300 olduğunu garanti etmez.
  Tam sohbet geçmişi kapalıdır. Kalıcı gelen-mesaj kayıtları mevcut
  sahiplik/onaylı-kaynak filtrelerinden geçer; diğer hesaplar bu canary'ye açılmaz.
- İlk yazım hatalı yük: inbound `cmtfwaim8009907mtpr29fbds`, alım
  `14:18:48.896Z`; Mersin–İstanbul/20 ton, römork tipi eksik, güven 80.
- İkinci yük: inbound `cmtfwakxa009s07mtq27gn5f8`, extraction
  `cmtfwakz0005v07s1s0zcv0s7`, alım `14:18:51.886Z`; Mersin–İstanbul,
  20 ton, CURTAINSIDER, güven 90, doğrulanmış yerel kural motoru v2.
  Otomatik yayın için tek eksik alan **publicContactPhone** idi.
- Karşı hesaptan iki kişilik onaylı gruba gönderilmiş teknik probe
  `cmtfw64pe00029xltbpk2f86l`, normal gönderme/silme servisleriyle SENT →
  DELETED oldu. Ana hesaptaki inbound `cmtfwalbk009v07mt3e2r1o5k` de
  DELETED_AT_SOURCE; ticari ilan oluşturmadı.

### Açık telefon onayıyla kontrollü test yayını

- Kullanıcıya numaranın bu test ilanında herkese açık olacağı ayrıca soruldu;
  kullanıcı **evet** dedi. Yalnızca yukarıdaki ikinci kaynağın telefonu
  normal sahiplik kontrollü moderasyon servisiyle tamamlandı.
- Yayın `14:22:53.292Z`, durum **MANUALLY_PUBLISHED**, ilan
  `cmtfwfr6s00018qmt1by4we4i`. Açıklamada test olduğu ve gerçek taşıma
  talebi olarak değerlendirilmemesi gerektiği açıkça belirtildi.
- İlan ACTIVE ve normal aktif canlı-feed servisi yanıtında `listing.created`
  olarak var. Bu servis sonucu, yetkisiz kullanıcıya API erişimi sağlandığı
  veya telefonda kartın görüldüğü anlamına gelmez.
- Kullanıcıdan WhatsApp'taki aynı mesajına test ibaresi ve iletişim telefonunu
  ekleyerek düzenlemesi istendi. Kaynak düzenlemesinin otomatik yayın sonucu,
  telefon ekranında görünürlük ve ticari test ilanının kaynak silme ile
  pasifleştirilmesi **henüz doğrulanmadı**.

### İnceleme hesabının pazar erişimi — çözüldü

- Değişiklik öncesi `freight_marketplace_public`: disabled, rollout 0;
  `freight_marketplace_internal`: enabled, rollout 100 (son değişim 24 Ağustos).
- İnceleme hesabı için `resolveFreightMarketplaceAccess` sonucu
  `{enabled:false,audience:null}`. Chrome'da inceleme hesabı da eski
  mesaj/hesap yönetimi dashboard'unu gösteriyor; canlı pazar ekranı yok.
- Mevcut politika yalnızca aktif yetkili PlatformAdmin veya genel public
  rollout yolunu destekliyor. İnceleme hesabına yönetici yetkisi verilmedi;
  kullanıcıya normal kullanıcı pazar erişiminin açılması ayrıca soruldu.
- Kullanıcı **evet** dedi. `14:27:18.373Z` itibarıyla yalnızca public bayrağı
  enabled/100 yapıldı. Platform sahibi ve etkin üyelik doğrulandı; beklenen
  eski bayrak durumu eşleşmeden değişiklik yapılmaz. Öncesi/sonrası audit var.
- Hem ana hesap hem inceleme hesabı artık `{enabled:true,audience:"public"}`.
  İnceleme hesabının yönetici kaydı değişmedi, aktif yönetici değil.
  İç bayrak, WhatsApp grup onayları ve sahiplik politikaları değişmedi.
- Değişiklik sonrası altı grup izolasyon sayacı tekrar **0**:
  sahipsiz hesap/grup, yanlış hesap sahibi, hesap içi yinelenen JID,
  yabancı grup kategori ataması ve yabancı grup mesaj alıcısı.
  `test-freight-marketplace.ts`: PASS.
- Canlı feed servisinde aynı ACTIVE test ilanı hâlâ bulunuyor. Fiziksel
  telefonda **kendi oturumunda** kartın görüldüğünü kullanıcı 17:30'da
  “evet görüyorum” diyerek doğruladı. Bu teyit, ayrıca inceleme hesabıyla
  telefonda oturum açıldığı şeklinde yorumlanmamalıdır.
- Sonraki kontrol için kullanıcıdan yalnızca bu ilana karşılık gelen son
  WhatsApp test mesajını Herkesten sil ile kaldırması istendi. 17:32 salt
  okunur kontrolde ilan hâlâ ACTIVE; silme işlemi tamamlanmış sayılmadı.

### Diğer kapıların güncel durumu

- Google Veri güvenliği sihirbazının 5. adım önizlemesine kadar salt okunur
  kontrol tamamlandı; Kaydet/Taslağı kaydet kapalı, beyan değiştirilmedi.
  Hesap silme bağlantısı mevcut. Hesabı silmeden kısmi veri silme sunulmaması,
  hesap silme imkânının olmadığı şeklinde raporlanmamalıdır.
- 17:23 worker denetimi: healthy, restart 0, beklenmeyen bağlantı kapanışı 0,
  job/recovery/producer/fatal/Prisma timeout hatası 0; 17 decrypt kaydı.
  Süre 265/3600 saniye ve recovery 5/59; Redis kümülatif hatası 31
  (beklenen 0). Sıkı soak **FAIL**. Eşikler/sayaçlar değiştirilmedi.
- 17:32 ek salt okunur Redis ACL denetimi: üç WRONGPASS olayının ikisi
  `2026-08-09T19:35:28.054Z`, biri `2026-08-22T12:00:04.166Z` tarihli.
  Bunlar 30 Ağustos worker düzeltmesinden önceki kayıtlar. 28 NOAUTH için
  bu ACL çıktısında tarih yok; tüm 31 olayın kökeni çözülmüş sayılmadı.
  Sayaçlar yine NOAUTH=28 / WRONGPASS=3. Redis kimlik doğrulaması, ACL'ler,
  istatistikler ve uzun süre kabul eşiği değiştirilmedi.
- 17:14 sonrasında USB cihaz listesi boş; daha sonraki telefon görünümü
  ADB ile doğrulanmış sayılmadı. Önceki gerçek 203 cihaz QA kanıtı korunuyor.
- İmaj 4/5 geçici dar kapsamlı canary'dir; normal kurulum zincirine kalıcı
  entegrasyonu ve uzun süreli yeni çevrimiçi mesaj testi açık kalmaktadır.
- Console taslağının son güncellemesi yapılmadı: tarayıcı güvenlik kontrolü
  “ücretli test sağlayıcısı” ifadesini kullanıcının “ücretli test hesabı”
  ifadesiyle uyuşmaz buldu. Reddedilen işlem alternatif yolla zorlanmadı.
  Son gözlenen Console yanıtı 297 karakterlik önceki taslaktır; yeni yerel
  yanıt aşağıda ayrıca belirtilmiştir. Son başvuru gönderilmedi.

## Devam kaydı — 30 Ağustos 17:13

### Google inceleme erişimi

- Kullanıcıya ayrıca sorulan izin sonrası, sadece mevcut inceleme hesabının
  giriş/erişim talimatı değişikliği Google'a gönderildi. Console'da
  **İncelenmekte olan değişiklikler → Oturum açma bilgileri talimatları**
  altında doğrulandı. Üretime erişim başvurusu veya üretim yayını gönderilmedi.
- Talimatlar, mevcut e-posta/parola ile OTP/2FA/satın alma gerekmeksizin
  giriş, etkin Pro ve zaten bağlı WhatsApp hesabının kullanımını anlatıyor.
  Parola bu rapora veya araç çıktısına yazılmadı.
- Politika durumu: **Sorun bulunmadı**. Uygulama içeriği: **Tamamlanmayı
  bekleyen beyan yok**. Bunlar tüm teknik kalite kapılarının geçtiği anlamına gelmez.
- Veri güvenliği sihirbazında 4. adıma kadar salt okunur kontrol: seçilen
  kişisel bilgiler, işlem geçmişi, mesajlar, foto/video, kişiler, dokümanlar,
  uygulama etkinliği, teşhisler ve cihaz kimliği soruları tamamlanmış.
  Şifreli aktarım ve hesap silme URL'si mevcut; hiçbir beyan değiştirilmedi.
- Lansman öncesi rapor hâlâ yok. 203 için 19.045 desteklenen cihaz,
  16 KB desteği, target 36, min 24 ve dört ABI doğrulandı; 202'yle cihaz
  kapsamı aynı. R8 düşük optimizasyon önerisi 202'de de var; onay garantisi değil.

### Gerçek Android 203 kabul denemesi

- Samsung A16 / Android 16 (API 36), Play Store güncellemesi ile 203 / 1.0.188.
  Oturum korunmuş; yeniden OTP istemedi. Soğuk açılış 315 ms,
  arka plandan dönüş 34 ms. Gözlenen çıkış kayıtlarında bu paket güncellemesi
  ve force-stop dışında yeni crash/ANR yok; uzun süreli sıfır hata iddiası değil.
- Ana sayfa, tam görünen alt menü etiketleri, klavye açılınca arama alanının
  görünürlüğü, Mersin araması, kaydırılabilir çekmece, bağlı hesaplar,
  Android sistem dosya seçicisini açıp iptal etme ve uygulamaya dönüş geçti.
- Telefonda yalnızca iki kişilik onaylı hedefe gerçek teknik mesaj gönderildi:
  kampanya `cmtfvhn3f00e807rxvdibzwne`, gönderim `13:56:22.075Z`,
  inbound `cmtfvhney00bu08t6grraefve`. Ticari olmayan mesaj doğru biçimde
  REJECTED; yapay ticari ilan oluşturulmadı.
- Telefonda Herkesten sil sonrası UI 1/1 silindi, 0 bekleyen/0 hata;
  DB DELETED ve inbound DELETED_AT_SOURCE `13:58:12.877Z`.
  WhatsApp tarafında silinmiş mesaj da görüldü. Mesaj geçmişi yeni satırı
  **aşağı çekerek yenileme** sonrası gösterdi; otomatik yenileme geçti denemez.
- `device-qa-20260830/delete.png`, kullanıcı uygulamayı değiştirdiği için
  WhatsApp sohbet listesi görüntüsüdür; Logivya silme ekranı kanıtı diye
  etiketlenmemeli veya diğer kişilerin bilgileriyle paylaşılmamalıdır.

### Telefonda gönderilen gerçek yük için açık aktarım sorunu

- 17:00'de kullanıcının WhatsApp grubuna yazdığı Mersin–İstanbul / 20 ton /
  tenteli araç mesajı telefonda görüldü; 17:13'te Logivya inbound kaydı yok.
  Önceki uygulama içi gönderme testleri dışarıdan gelen mesaj kabulünü kanıtlamaz.
- Onaylı grup ve ana/inceleme hesabındaki grup JID'si aynı. Ana kaynak etkin,
  onaylı, duraklatılmamış, hesap CONNECTED; genel pause/kill switch kapalı.
  İlan güven eşiği düşürülmedi; inbound satırı elle eklenmedi.
- Önceki outbound-only Baileys yaması offline-preview olayını tüm hesaplarda
  yok sayıyor. Bunun pending delivery ile canlı akışı etkileyip etkilemediğini
  ayırmak için **yalnızca ana hesabın onaylı iki kişilik kaynağı mevcutsa**
  çalışan, en çok üç adet count=100 protokol isteği yapan canary hazırlandı.
  Tam sohbet geçmişi kapalı; diğer hesapların politikası değişmedi.
- Canary imajı: `logivya-worker:pending-ingestion-20260830-4`,
  ID `sha256:73dad7b48e66b0dbb712cc037888d5ec0d2a82e0b5e64895d2e015227e86c437`.
  Başlangıç `2026-08-30T14:11:19.074825064Z`, health healthy. Tam kirli kaynak
  ağacı değil, checksum ile doğrulanmış iki dosya değişti. Ön kontrol active/
  waiting işleri sıfır; kullanıcıya ait tek zamanlı kampanya korundu.
- Ağsız imaj kontrolleri: 16 silme + 8 revoke + 12 buffer + 11 pending-policy
  + 7 canary kapsam/mahremiyet testi başarılı (54). Yerel tam stable-core
  tekrar başarılı; altı hesap/grup izolasyon anomali sayacı sıfır.
- Canary bir pending batch istedi; henüz offline tamamlanma veya hedef
  kaynak olay kaydı görülmedi. Başlangıçta 11 eski oturum eşleşme hatasına
  ek üç group decryption hatası gözlendi; bunlar test grubuna ait değil.
  Özel metin/telefon/şifreli içerik veya mesaj anahtarı tanı loglarına eklenmedi.
  Düzeltme **kanıtlanmış sayılmıyor**. Kullanıcıdan aynı grupta tek yeni gerçek
  yük paylaşımı istendi; sonuca göre sürdürme/geri dönüş kararı verilmeli.
- Geri dönüş: `deploy.sh --rollback --pending-ingestion` yalnızca imajı
  önceki `live-event-buffer-20260830-3` sürümüne alır; env yedeği
  `/opt/logivya/compose/app/.env.pre-pending-ingestion-20260830-4`.
- Sıkı soak açık: üçüncü imaj 30 dakika dolmadan canary için yeniden başladı.
  Önceki 31 Redis kimlik doğrulama hatası sıfırlanmadı; kabul eşikleri gevşetilmedi.

## Devam kaydı — 30 Ağustos 16:46

- Baileys 6.7.24 için `patch-baileys-live-event-buffer.mjs` eklendi. Geçmiş
  indirmesi kapalı bağlantı artık gelmeyebilen offline-complete olayını sonsuza
  kadar beklemiyor. Yalnızca Online durumunda tamamlanan upsert işlemi olayları
  boşaltıyor; ilk/geçmiş senkronizasyon ve kapanan soket davranışı korunuyor.
- Gerçek Baileys event-buffer ve kurulu callback'lerle, ağsız runtime testi:
  önce 7 başarısız/5 başarılı; düzeltme sonrası 12/12 başarılı. Tam stable-core
  komutu, web/mobile typecheck ve yeni dosyaların lint kontrolleri başarılı.
- Üçüncü dar kapsamlı imaj: `logivya-worker:live-event-buffer-20260830-3`;
  ID `sha256:0c2878d142dfed5bc58eb1f8ac1d83eb6b24bf3b85a52d1bba592879cf28755c`.
  Sabit taban `04451838…73ed9`, özgün chats.js SHA-256
  `9eef48356529d9078e0a09ae94d443e29c2795a0c86c64f3d47580994884add4`.
  Ağsız imajda 16 silme + 8 source-revoke + 12 buffer testi başarılı.
  Başlangıç `2026-08-30T13:41:15.758609368Z`; health healthy.
  Tam kaynak ağacı değil, yalnızca checksum ile doğrulanan chats.js değişti.
- Geri dönüş imajı `logivya-worker:pre-live-event-buffer-20260830`;
  env yedeği `/opt/logivya/compose/app/.env.pre-live-event-buffer-20260830-3`.
  Ana ve inceleme hesabı yeni eşleme istemeden CONNECTED olarak geri geldi;
  16:45 heartbeat güncel, mesaj kuyruğu active/waiting/delayed 0. Kullanıcının
  önceden zamanlanmış bir kampanyası korundu.
- Beşinci teknik mesaj: kampanya `cmtfuyn7r00021ht6xkc1y8qf`, aynı onaylı
  iki kişilik Logivya grubu; gönderim `13:41:39.610Z`, inbound
  `cmtfuyqhv000k08t6b1wwurzt`, alım `13:41:39.619Z`, işleme `13:41:39.764Z`.
  Ticari içerik olmadığı için REJECTED/COMPLETED; sahte ilan yayımlanmadı.
  Silme isteği `13:42:03.515Z`, sonuç DELETED; inbound DELETED_AT_SOURCE,
  güncellenme `13:42:03.670Z`. Kullanıcının bu beşinci mesaj için görsel teyidi
  henüz yok; kanıt sunucu/pipeline durumlarıdır.
- Önceki imajın 1418 saniyelik gözleminde beklenmeyen kapanma/iş hatası 0,
  restart 0, decrypt 11, Redis kümülatif hata 31. Yeni imajın 265 saniyesinde
  aynı durum: runtime hatası 0, decrypt 11, Redis 31. Sıkı saatlik soak hâlâ
  FAIL (yetersiz süre + tarihsel Redis sayacı); sayaç sıfırlanmadı/eşik gevşetilmedi.
- Android 203/1.0.188 QA AAB, `062b7ef7…3ca3` karmasıyla dahili teste completed
  olarak alındı. Yükleme öncesi internal 202, closed 198 ve en yüksek kod 202
  doğrulandı; yükleme sonrası closed/production değişmediği yeniden doğrulandı.
  Bu yalnızca cihaz doğrulama dağıtımıdır; release acceptance bayrağı verilmedi.
  Samsung USB yeniden bağlandı; kurulu sürüm hâlâ 202 iken Play Güncelle
  düğmesi kullanıldı. Sonraki kurulum/cihaz sonucu ayrı kaydedilecek.
- Başvuru adım 3'teki desteklenmeyen “rapor sonrası ekledik” metni 291 karakterlik
  yerel doğrulanabilir metinle değiştirildi. Nihai hazırlık alanı henüz sonlanmadı.
- İnceleme hesabının önceden bağlı WhatsApp ve OTP/QR/satın alma gerektirmeyen
  erişimini anlatan mevcut ek not Kaydet ile kaydedildi; sonrasında Kaydet pasif.
  Kullanıcı adı/parola değiştirilmedi. Üretime erişim Uygula düğmesine basılmadı.

Aşağıdaki önceki saatli kayıtlar tarihçedir; güncel durum bu bölüm ve Sonuç'tadır.

## Chrome yeniden kurulum kontrolü — 30 Ağustos 16:30 sonrası

Kullanıcı yeniden kurulumu tamamladığını bildirdi. Chrome üzerinden Play
Console'un mevcut oturumundaki sekme başarıyla devralındı ve canlı DOM
okuması çalıştı. Önceki sekme devralma zaman aşımı bu denemede tekrarlanmadı.

- Üretime erişim koşulları işaretli; üretim hâlâ etkin değil.
- Açık başvuru taslağının dört bölümü okundu. Ücretli Testers Community,
  15 test kullanıcısı ve ölçülmeyen özellik kullanımlarını iddia etmeme
  açıklamaları Console taslağında mevcut. “Ücretli sağlayıcı kullanmadık”
  ifadesi bu kontrol edilen taslakta yok.
- “Geri bildirime göre değişiklikler” alanı hâlâ özelliklerin rapor nedeniyle
  eklendiğini ileri süren eski metni içeriyor; yerel rapordaki daha dar ve
  doğrulanabilir taslakla eşleşmiyor. Hazırlık yanıtı da son mesaj testleri
  ve açık canlı aktarım bulgusundan önceki metin. Bu iki alan güncellenmedi.
- Lansman öncesi raporun canlı Genel bakış sayfası hâlâ “Lansman öncesi
  rapor oluşturmak için yapı yükleyin” diyor; rapor oluşmuş değil.
- Rapor ayarları, kimlik bilgileri uygulama içeriğinde zaten verilmişse
  tekrar sağlanmasının gerekmediğini belirtiyor. Ayarlar değiştirilmedi.
- Yalnızca okumak için taslakta Geri düğmeleri kullanıldı. Metin alanları,
  seçimler ve erişim bilgileri değiştirilmedi; Uygula/Kaydet, paket yükleme
  veya üretime başvuru gönderimi yapılmadı. Form ilk bölümde açık bırakıldı.

Chrome erişimi artık engel değil. Android 203 cihaz kabulü, canlı ilan
aktarımı, kaynak silmenin yayına yansıması, uzun süreli worker kabulü ve
nihai dürüst başvuru yanıtlarının eşleştirilmesi açık kalıyor.

## Devam kaydı — 30 Ağustos 16:25

Bu bölüm önceki saatli kayıtları günceller. Aşağıdaki 15:00–15:49 kayıtları
tarihçedir; “ana hesap bağlı değil”, “mesaj gönderilmedi” veya “canlı dağıtım
yapılmadı” ifadeleri yalnızca kendi kontrol saatleri için geçerlidir.

### Bağlantı ve gerçek mesaj kabulü

- Ana hesap 15:58:16'da kullanıcı tarafından yeniden eşleştirildi. 16:18:31
  kontrolünde ana hesap ve inceleme hesabı CONNECTED, heartbeat güncel,
  hata alanları boş ve oturum snapshot'ları kayıtlıydı. İki worker dağıtımı
  sonrasında yeniden kod istemeden oturumlar geri geldi.
- Hesap sahipliği veya grup yayın izinleri değiştirilmedi. Beş kaynak
  önceden onaylı kaynaklardır; yeni bir özel grup aktarıma açılmadı.
- İnceleme hesabından kullanıcının izin verdiği Burak Serezs kişisine ve
  bir üyeli Logivya grubuna 16:01'de iki açıkça etiketlenmiş teknik test
  mesajı gönderildi. İkisi de 16:02'de Herkesten Sil ile kaldırıldı.
  Kullanıcı hem teslimi hem iki taraftaki silinmeyi doğruladı.
- Ana hesabın iki üyeli Logivya Türkiye Geneli Nakliyat kaynak grubuna
  16:04'te üçüncü teknik test gönderildi. Mesaj 16:04:28'de kaynak işlem
  hattına ulaştı; yaklaşık 200 ms içinde REJECTED/COMPLETED oldu. Lojistik
  ilan olmadığı için yayımlanmaması beklenen sonuçtur; bu, gerçek yük
  yayını kabulü değildir.
- Üçüncü mesaj DELIVERED durumundayken silme işi MESSAGE_NOT_SENT hatası
  verdi. API'nin kabul ettiği DELIVERED durumunu worker'ın reddettiği
  saptandı. Birinci düzeltmeden sonra aynı mesajın normal silme isteği
  tekrarlandı; 16:13'te DELETED oldu. Kullanıcı telefondaki silinmeyi de
  ayrıca doğruladı. Veritabanında sonuç durumu zorla değiştirilmedi.
- İkinci düzeltmeden sonra aynı iki üyeli gruba dördüncü teknik test
  16:17:45'te gönderildi, 16:18:07'de sunucu kaydı DELETED oldu. Ancak
  16:20 kontrolünde kaynak inbound kaydı yoktu. Bu mesaj için telefon
  teyidi ve kaynak silme zinciri kabulü yoktur.
- Testler mevcut yetkilendirme/kuyruk/silme servisleri üzerinden dar
  kapsamlı operasyon betikleriyle yapıldı. Bunlar 203 Android adayının
  kullanıcı arayüzü kabulü yerine geçmez. Ticari nitelikli sahte yük veya
  yapay inbound kaydı oluşturulmadı; gerçek güncel yük metni bekleniyor.

### İki dar kapsamlı worker düzeltmesi

1. `src/worker/index.ts`: Herkesten Sil görevinin gönderilmişlik kontrolü
   SENT ve DELIVERED durumlarını birlikte kabul ediyor. Sahiplik, mesaj
   anahtarı, süre ve atomik işlem kontrolleri korunuyor.
   `scripts/test-delete-for-everyone-worker.mjs`, gerçek fonksiyonu izole
   çalıştırıyor: düzeltme öncesi 5 hata, sonrası **16/16 başarılı**.
2. `src/worker/baileys-provider.ts`: Baileys'in `messages.update` üzerinden
   verdiği null-message/REVOKE olayı kaynak silme servisine bağlandı.
   Orijinal mesajın dış olay anahtarı ve mevcut hesap sınırı kullanılıyor;
   revoke zarfının kimliği kaynak mesajı yerine kullanılmıyor.
   `scripts/test-whatsapp-source-revoke.mjs`: önce 3 hata, sonra **8/8
   başarılı**. Gerçek kaynak ilanını pasifleştirme kabulü henüz yapılmadı.

Her iki düzeltmeden sonra stable-core regresyonu, web typecheck, mobil
typecheck, WhatsApp canlı ilan motor testi ve 317 sayfalık web derlemesi
geçti. Ek runtime testleri hem yerelde hem izole üretim imajında geçti.
Provider lint sonucunda 0 hata ve mevcut bir kullanılmayan değişken uyarısı
vardı. Bu kontroller uzun süreli çalışma veya Android cihaz kabulü değildir.

Yerel kirli ağacın tamamı dağıtılmadı. İmajlar çalışan üretim tabanından,
önceki dosya SHA-256 değerlerini doğrulayan tekil yamalarla oluşturuldu.
Oturum/media volume'ları, ağ, sırlar ve diğer yapılandırma korunmuştur.

| Dağıtım | İmaj | Başlangıç (Türkiye) |
| --- | --- | --- |
| DELIVERED silme düzeltmesi | `logivya-worker:delivered-delete-20260830-1` | 16:12:42 |
| Kaynak REVOKE düzeltmesi; son çalışan | `logivya-worker:source-revoke-20260830-2` | 16:17:08 |

Son imaj kimliği:
`sha256:04451838cc0cb0299e1bb37bc917a7e708e8ac204417b32b69b141d31b573ed9`.
Önceki imaj kimliği:
`sha256:909e788973ff9a6e3c8066ec1b881b0fba06ca698af9e705a06221e059f6f0cd`.
Başlangıç tabanı:
`sha256:c7dc0854256495cb48f5b07e41a8d9d75a6779718b975e69a14d5ffb44c07673`.

Dağıtım/geri alma araçları:
`ops/vps/hotfix-delivered-delete-20260830/`.
Uzak `.env` yedekleri:
`/opt/logivya/compose/app/.env.pre-delivered-delete-20260830-1` ve
`/opt/logivya/compose/app/.env.pre-source-revoke-20260830-2`.
Yalnızca `LOGIVYA_WHATSAPP_WORKER_IMAGE` satırı değişti; yalnızca
`whatsapp-worker` servisi yeniden oluşturuldu. Bu değişkeni kullanan ayrı
ingestion servisi bu işlemde yeniden oluşturulmadı. Redis yeniden
başlatılmadı, sayaçlar sıfırlanmadı veya kullanıcı verisi temizlenmedi.

### Açık canlı olay tamponu bulgusu

Kurulu Baileys 6.7.24 kaynak incelemesi iki risk gösteriyor:

- Restore sırasında `socket.js` olayları tamponlamaya başlıyor ve offline
  bitiş olayını bekliyor. Mevcut Logivya offline-preview yaması eski şifreli
  geçmişin indirilmesini engelliyor; bitiş olayı gelmezse tampon açık kalabilir.
- `event-buffer.js` içindeki `createBufferedFunction` her çağrıda tamponu
  açıyor fakat finally bloğunda boşaltmıyor. Boşaltmanın durum makinesi
  tarafından yapılacağı belirtiliyor. `chats.js` içindeki canlı mesaj
  upsert'i bu sarmalayıcıyı kullanıyor; online duruma geçişten sonraki
  mesajlarda ayrıca boşaltma gerekip gerekmediği runtime testle sınanmalıdır.

Dördüncü probe'un inbound kaydının bulunmaması gözlemlenen belirtidir.
Ek yerel runtime deneyi, kurulu paketin gerçek `makeEventBuffer` ve
`createBufferedFunction` koduyla, hiç bağlantı/senkronizasyon olmadan yapıldı:
tek upsert çağrısı bittikten sonra teslim edilen olay sayısı 0 ve tampon
açıktı; açık `flush()` sonrası olay sayısı 1 ve tampon kapalıydı. Deney
WhatsApp'a bağlanmadı veya mesaj göndermedi. Bu, sarmalayıcının tek başına
olayı bırakmadığını doğrular; bütün socket durum makinesinin veya üretimdeki
gözlemin tek başına uçtan uca açıklaması değildir. İlk doğrudan alt-modül
importu döngüsel import hatası verdi; paket ana modülü önce yüklenerek deney
tekrarlandı ve exit 0 tamamlandı. Bu yardımcı import sırası ürün değişikliği
olarak uygulanmadı.
Bu iki kod bulgusu **henüz tamamlanmış düzeltme veya kesin uçtan uca kök neden
kanıtı değildir**. Bu kayıt anında buffer yaması veya üçüncü worker dağıtımı
yapılmadı. Eski şifreli geçmişi yeniden açmak, kör periyodik flush eklemek
veya sahte kayıt üretmek kabul çözümü değildir.

### Uzun süreli çalışma ve dış doğrulamalar

- Soak betiğinin eski düz metin eşlemesi yapılandırılmış bağlantı kapanış
  loglarını kaçırıyordu. Yapılandırılmış kapanış, beklenmeyen kapanış,
  provider işi ve decrypt hataları için sayaçlar eklendi. Eşikler
  gevşetilmedi; 7 gözlemlenebilirlik fixture testi geçti.
- İlk düzeltmeden önce 16:03'te eski imajın sıkı soak sonucu FAIL:
  49.133 saniye, 819 recovery döngüsü, RestartCount 1, 68 yapılandırılmış
  kapanış (66 beklenmeyen), 4 provider işi hatası ve 307 decrypt hatası.
  Daha önceki “bağlantı kapanması 0” sonucu yalnızca eksik eski eşleşmedir.
- İkinci dağıtımdan sonra 16:18:09 kontrolü yalnızca 61 saniye/1 recovery
  döngüsünü kapsıyor: healthy, RestartCount 0, beklenmeyen kapanış 0,
  provider işi hatası 0, decrypt hatası 11. Sıkı soak yine **FAIL**;
  3600 saniye/59 döngü koşulu sağlanmadı ve Redis kümülatif hataları 31.
  Planlı yeniden oluşturma yeni uzun dönem kanıtı sayılmamalıdır.
- Redis hata toplamı önceki kontrollerden beri değişmedi: 28 NOAUTH,
  3 WRONGPASS. ACL kaydı üç WRONGPASS olayını eski tarihlere bağladı;
  28 NOAUTH için kaynak/zaman henüz belirlenmedi. Hata sayacı sıfırlanmadı.
- 16:04 salt okunur Play denetimi: kapalı test 198/1.0.183,
  dahili test 202/1.0.187; üretim boş. 203 hâlâ yüklenmedi.
- Chrome sekmeleri listeleniyor fakat devralma zaman aşımı sürüyor.
  Kullanıcıya resmi eklenti yeniden kurulum adımları verildi; yeniden
  kurulum henüz teyit edilmedi. Form ve lansman öncesi rapor yeniden
  okunamadı; başvuru ve ek incelemeci notu gönderilmedi.

## Devam kontrolü — 30 Ağustos 15:00 sonrası

### Tamamlanan yerel düzeltmeler

- Ana ekranda klavye açıldığında odaktaki arama kartını görünür konuma taşıyan
  kaydırma ve başlık yüksekliğini hesaba katan `KeyboardAvoidingView` eklendi.
- Alt menü varken ortak `Screen` ikinci kez alt güvenli alan/18 birim boşluk
  eklemiyor. Menü olmayan giriş/yan panel ekranlarının alt koruması korunuyor.
- “Araç Bul - Paylaş” alt menü etiketi artık tek satıra ve 72 birim genişliğe
  zorlanmıyor. Bunlar **kaynak düzeltmeleridir**; telefonda yeni paket henüz yok.
- Web ilk kullanım rehberindeki üç dahili bağlantı Next `Link` kullanıyor.
- Genel ESLint'teki 12 hata giderildi: üç dahili bağlantı, worker'da yalnızca
  üç tek-atamalı değişkenin `const` tanımı ve iki bağımsız `.cjs` operasyon
  betiğine uygun CommonJS lint ayarı. `.cjs` için yalnızca ESM-import zorlaması
  kaldırıldı; diğer kurallar açık. Operasyon betikleri çalıştırılmadı.
- Worker'ın eşleştirme, kuyruk, veri sahipliği ve gönderim davranışı değişmedi;
  bu üç tanım değişikliğinden sonra çekirdek regresyon paketi tekrar geçti.
  Canlı worker veya web dağıtımı yapılmadı.

Başarılı tekrarlar: `npm run typecheck`, mobil typecheck,
`npm run test:stable-core`, `npm run build` (317 sayfa),
`npm run lint` (0 hata, 5 mevcut kullanılmayan değişken uyarısı),
`test-mobile-keyboard-insets.mjs`, Android edge-to-edge kaynak testi ve
mobil ürün/erişim/gizlilik/medya/dizin/tutarlı teslim kontratları.
Grup denetiminin yerel komut çıktısı sıfır uyumsuzluk gösterir. Ek olarak
15:31:57'de üretim PostgreSQL üzerinde `BEGIN READ ONLY` işlemiyle aynı altı
denetim çalıştırıldı: sahipsiz hesap, sahipsiz grup, hesap/grup sahiplik
uyumsuzluğu, aynı hesap içinde yinelenen grup, başka şirkete kategori ataması
ve yabancı grup/hesaba mesaj alıcısı sayıları **0/0/0/0/0/0**. Yalnızca toplam
sayılar alındı; özel grup/mesaj içerikleri çıkarılmadı ve veri değiştirilmedi.
Bu bulgu UI yetkilendirme testinin veya tüm migration kabulünün yerine geçmez.

### Son QA dosyası — 15:49

- `artifacts/releases/android-v203/logivya-v203-1.0.188-lint-privacy-qa.aab`
- Boyut: **65.072.749 bayt**.
- SHA-256: `062B7EF7739732181F1363F305FC577398FDEEE6338387EC41592512A3BA3CA3`.
- Paket raporu: `artifacts/releases/android-v203-lint-privacy-manifest.json`.
- Lint raporu: `artifacts/releases/android-v203-lint-privacy-lint.txt`.
- Kaynak build çıktısı ve arşivlenen AAB'nin karmaları aynı.
- Son dosyada **31/31** paket kontrolü geçti: sürüm, SDK 24/36/36, dört ABI,
  imza/sertifika, izinler, üretim HTTPS adresi, OAuth eşleşmesi ve gömülü
  gizli bilgi kalıpları denetimi. Bu tarama tüm olası sırların yokluğunu kanıtlamaz.
- İki yedekleme kuralı XML kaynağının son AAB'nin `base/res/xml/` bölümünde
  bulunduğu da ZIP dizininden doğrulandı.
- **44/44** arm64/x86_64 ELF kitaplığının LOAD segmentleri 16 KB hizalı;
  BundleConfig `PAGE_ALIGNMENT_16K`. Gerçek 16 KB çalışma testi yapılmadı.
- Bu **QA adayıdır**, final yayın onayı değildir. Kaynak ağacı temiz değil;
  `393c7a5cc75dd2165ec93f48bc83686c31c9e862` tabanı tek başına tüm değişiklikleri
  yeniden üretmeye yetmez. Raporun gerçek cihaz/release onay alanları boş bırakıldı.
- Önceki iki 203 dosyası korunmuştur. Üç dosya aynı versionCode'u taşır;
  hiçbiri Play'e yüklenmedi ve aynı kodla birlikte yayımlanamaz.

### Önceki klavye QA dosyası — son aday yerine kullanılmamalı

- `artifacts/releases/android-v203/logivya-v203-1.0.188-keyboard-insets-qa.aab`
- Boyut: **64.760.061 bayt**.
- SHA-256: `26FE41451CD61D6FD87E65CB85B9585FDF20BAA79001A1F6E5DFBFA86A25933E`.
- Rapor: `artifacts/releases/android-v203-keyboard-insets-manifest.json`.
- Paket doğrulaması **31/31**; dört ABI, sürüm, imza, izin ve üretim adresi
  kontrolleri geçti. Ayrı kontrolde 44/44 arm64/x86_64 ELF LOAD segmenti
  16 KB hizalı; BundleConfig `PAGE_ALIGNMENT_16K`.
- Önceki `edge-to-edge-qa.aab` korunmuştur fakat son klavye/alt menü
  düzeltmelerini içermez. İki dosya aynı versionCode'u taşır; hiçbiri
  Play'e yüklenmedi. **İkisi birlikte yayımlanamaz.**
- Bu dosya son Compose/manifest/yedekleme düzeltmelerini içermez; son aday
  yukarıdaki `lint-privacy-qa.aab` dosyasıdır.

### Android analiz uyumluluğu

K1 UAST ile komut-satırına özel bir tekrar yapıldı
(`-Pandroid.lint.useK2Uast=false`). AAB üretimi bitti fakat tam lint yine
`ComposableCoroutineCreationDetector` içinde durdu; bu kez eski Kotlin
metadata okuyucusu 2.1.0 metadata için en fazla 2.0.0 desteklediğini bildirdi.
Bu seçenek kalıcı yapılandırmaya eklenmedi, hiçbir Compose denetimi kapatılmadı.
Geçici `tmp/compose-lint-compat.init.gradle` ile Compose runtime 1.9.5
deneyinde `:expo-iap:lintRelease` başarılı bitti; rapor “No issues found.”
bildirdi. Sonrasında kök Android Gradle dosyasına runtime ailesinin dört
modülü için 1.9.5 alt sınır kısıtları eklendi. Bunlar yeni bağımlılık eklemez
ve gelecekte daha yeni bir sürümü zorla düşürmez. Lint denetimleri açık,
K2 varsayılanı korunuyor; node_modules veya Gradle önbelleği yamalanmadı.
Kalıcı ayarla tam lint ilk kez rapor üretebildi. İki hata tespit edildi:
yerel `sdk.dir` yolunda kaçırılmamış sürücü iki noktası ve CAMERA iznini
kaldıran `tools:node="remove"` satırına rağmen kamera donanım şartı uyarısı.
SDK yolu standart properties biçimine düzeltildi; kamera isteğe bağlı donanım
olarak açıklandı. Kamera izni kaldırılmaya devam ediyor, yeni izin açılmadı.

Ayrıca `allowBackup=false` korunarak Android 11 ve altı için full-backup,
Android 12+ için cloud-backup/device-transfer XML kuralları eklendi. Dokuz
uygulama depolama alanı tümüyle dışlanıyor; cihaz oturumu, önbelleğe alınmış
mesaj veya tanımlayıcıların yeni cihaza taşınmaması amaçlanıyor. Mevcut
cihazdaki veriler silinmez; gerçek yedekten dönüş testi henüz yapılmadı.
[Android yedekleme kuralları](https://developer.android.com/identity/data/autobackup).

Bu düzeltmelerle tam `:app:lintRelease` geçti: **0 hata, 22 uyarı**.
Uyarılar: 10 eski tip launcher simge biçimi, 8 kullanılmayan kaynak,
2 kaldırma satırına ait ScopedStorage, 1 eski API'de yok sayılan bildirim
niteliği ve 1 Gradle yama sürümü önerisi. Hiçbiri bastırılmadı.
Birleştirilmiş manifestte CAMERA izni sayısı 0, kamera donanımı required=false,
allowBackup=false ve iki yedekleme XML referansı doğrulandı.
Birleşik `:app:lintRelease :app:bundleRelease` komutu **11 dakika 41 saniyede
exit 0** ile tamamlandı; 848 görevden 196'sı çalıştı, 652'si günceldi.
Varsayılan K2 kullanıldı; geçici Compose init deneyi son derlemede kullanılmadı.
Son `lint-privacy-qa.aab` bu bağımlılık/manifest değişikliklerini içeriyor.

Derlemenin ASM dönüştürme aşaması bazı Expo sınıflarının çözümlenemediğini ve
JVM testlerinde stack frame sorunu olabileceğini ayrıca bildirdi. Çıktıda adı
verilen **10 sınıfın tamamının DEX sınıf tanımları hem önceki klavye adayında
hem son adayda bulundu**; yalnızca string araması yapılmadı. Çıktı ayrıca adı
yazılmayan üç sınıftan söz ediyor; bunlar ayrı doğrulanamadı. Bu bulgu bir
eksik paket varsayımını desteklemese de dönüştürülmüş frame doğruluğunu veya
cihazda sorunsuz çalışmayı kanıtlamaz. Uyarı gizlenmedi, instrumentation
kapatılmadı ve gerçek cihaz kabulü açık bırakıldı.

Kaynak koruma testi: `node scripts/test-android-compose-compatibility.mjs`.
Yedekleme/izin koruma testi: `node scripts/test-android-backup-privacy.mjs`.
Uyumluluk dayanakları: [Compose lint](https://developer.android.com/develop/ui/compose/tooling/lint),
[Compose runtime sürümleri](https://developer.android.com/jetpack/androidx/releases/compose-runtime),
[Gradle kısıtları](https://docs.gradle.org/current/userguide/dependency_constraints.html).

### Canlı worker/Redis denetimi — 15:32

`audit-whatsapp-worker-soak.sh` sıkı kabul sonucu **FAIL**:

- Worker healthy, OOM yok, son başlangıçtan beri 47.317 saniye (13 saatten
  fazla) ve 789 tamamlanmış kuyruk toparlama döngüsü.
- Bağlantı kapanması, kuyruk toparlama/üretici hatası, izole/fatal süreç hatası,
  ETIMEDOUT ve P2028 sayıları son başlangıçtan beri sıfır.
- Docker RestartCount **1**; önceki kapanmanın nedeni mevcut olay çıktısında
  bulunamadı. En son başlangıç 30 Ağustos 02:24 Türkiye saati.
- Redis'in yaklaşık 21 günlük kümülatif hata sayısı **31**: 28 NOAUTH ve
  3 WRONGPASS. Bu sorgu hataların zamanını veya istemcisini göstermiyor;
  hepsini eski bakım izi olarak kabul etmek için kanıt yok.
- Redis 39 istemci, 9,63 MB / 512 MB bellek, noeviction; reddedilen
  bağlantı ve anahtar tahliye sayısı sıfır. Tüm uygulama container'ları healthy.

Sayaçlar sıfırlanmadı, servisler yeniden başlatılmadı ve kabul eşikleri
gevşetilmedi. Anlık sağlık olumlu olsa da uzun süreli kabul **geçti sayılmadı**.
15:38:18 tekrarında Redis hata sayıları ve worker başlangıç/restart sayısı
değişmedi. Bu birkaç dakikalık gözlem geçmiş yeniden başlatmayı açıklamaz.

Mesaj kayıtlarının ek salt okunur incelemesi: son 24 saatte FAILED kaydı
yok, en son hata 20 Ağustos. PENDING iki alıcı, RECONNECT_REQUIRED durumunda
bir hesabın RECURRING/QUEUED kampanyasına ait; sonraki zaman 31 Ağustos 01:07
Türkiye saati. Bu kampanyalar iptal edilmedi veya yeniden gönderilmedi.

### Dış kontroller — 15:42 tarihsel durum

Chrome sekmeleri listeleniyor, fakat sekme devralma işlemi zaman aşımına
uğruyor. Kullanıcının dar onayıyla aynı profilde boş Chrome penceresi açıldı;
sonrasında verdiği uzantı izniyle de tekrar denendi. Sorun sürüyor. Browser
becerisinin kurtarma adımları doğrultusunda eklentinin yeniden kurulması
istendi; alternatif tarayıcı otomasyonu veya oturum çerezi çıkarımı yapılmadı.

Kullanıcı gerçek test mesajına izin verdi. Canlı veritabanında inceleme
hesabının “Burak Serezs” kaydı ile iki küçük “Logivya” grubunun doğru
kullanıcıya ait ve gönderilebilir olduğu salt okunur sorguyla doğrulandı.
**Henüz test mesajı gönderilmedi ve Herkesten Sil denenmedi.** Ana hesap
yeniden bağlanmadı; Console başvurusu ve ek erişim notu gönderilmedi.

### Canlı ilan akışı — 15:42 kontrolü

Üretim veritabanındaki salt okunur sayımda otomatik yayına açık beş kaynak
grubun **tamamı ana WhatsApp hesabına** ait ve bu hesap `RECONNECT_REQUIRED`.
Bağlı ve aktarımı açık kaynak grup sayısı **0**. Genel duraklatma ve acil
durdurma kapalı olsa da mevcut kaynak bağlantılarıyla anlık aktarım yapılamıyor.
İnceleme için bağlı hesap, kaynakların tanımlı olduğu ana hesaptan farklı.

- Son kaynak mesajı: 29 Ağustos 16:24 Türkiye saati.
- Son WhatsApp ilan yayını: 29 Ağustos 16:32; bu tek yük ilanı artık INACTIVE.
- Beş ACTIVE yük ilanının kaynağı LOGIVYA; en yeni yayın 28 Ağustos 00:11.
  Bunlar yeni WhatsApp mesajının aktarıldığının kanıtı değildir.
- Ana hesabı bağlamama tercihi korundu. Canlı ilanlar için yeniden bağlantı
  konusunda kullanıcıdan ayrıca yön istendi; bağlantı/grup yayım izni değiştirilmedi.
- Bu bulgu, Play'in üretime erişim düğmesi için ikinci WhatsApp bağlantısının
  zorunlu olduğu anlamına gelmez. Ürünün vaat ettiği anlık aktarım kabulü ayrıdır.

## Doğrulanan canlı durum

| Kontrol | Bulgular |
| --- | --- |
| Kapalı test | `Kapalı Test ` kanalında 198 / 1.0.183, completed |
| Dahili test | 202 / 1.0.187, completed |
| Üretim | Yayımlanmış sürüm yok |
| Test koşulu | Console'daki üç koşul tamamlanmış; ek test koşulu da işaretli |
| Mağaza içeriği | tr-TR ve en-US açıklamaları; her dilde 8 telefon, 2 küçük tablet, 2 büyük tablet görseli |
| İçerik beyanları | 10 tamamlanmış beyan; bekleyen beyan görülmedi |
| İnceleme hesabı | Console'da mevcut bilgilerle www.logivya.com giriş testi başarılı; OTP veya satın alma istenmedi |
| İnceleme WhatsApp hesabı | Bağlı; 129 grup; hesap/grup kullanıcı ve şirket sahipliği uyumsuzluğu 0 |
| Ana WhatsApp hesabı | Kullanıcının sonraki açık onayıyla 15:58'de yeniden eşleştirildi; 16:18 kontrolü CONNECTED |
| Lansman öncesi rapor | Genel bakışta hâlâ “Lansman öncesi rapor oluşturmak için yapı yükleyin” görülüyor |

Lansman öncesi rapor ayarları, kimlik bilgileri uygulama içeriğinde zaten
verildiyse tekrar girilmelerinin gerekmediğini açıkça söylüyor. Bu nedenle
ayrı “Kimlik bilgisi sağlama” seçimi tek başına eksiklik olarak değerlendirilmedi.
Bağlantı 14:21 Türkiye saati civarında tekrar kontrol edildi: CONNECTED,
güncel heartbeat ve boş hata alanı görüldü.

İnceleme parolası burada tutulmaz. Giriş testi için kullanıcıdan ayrıca onay
alınmıştır. Bu ilk UI denetiminde gerçek mesaj gönderilmedi. Sonraki açık
izinle 16:01–16:18 arasında yapılan dört gerçek mesaj testinin kapsamı ve
üç mesajın kullanıcı silme teyidi yukarıdaki güncel kayıtta belirtilmiştir.

İncelemeci erişim açıklamasına önceden bağlı WhatsApp hesabını anlatan ek not
hazırlanmıştır. **Kaydet işlemi güvenlik onayında durduğu için bu ek not
Console'a kaydedilmemiştir.** Önceden kayıtlı ve girişte doğrulanan bilgiler
korunmaktadır. Başvuru formunun son Uygula düğmesine de basılmamıştır.

## Android 15 düzeltmesinin kapsamı

- `react-native-screens` 4.16.0 yerine **4.18.0** tam sürümüne sabitlendi;
  kilit dosyası güncellendi. npm yalnızca bir kurulu paketi değiştirdi.
- Upstream #3264, Screens'in eski status/navigation bar renk API çağrılarını
  kaldırır. 4.18.0 ayrıca yerel bileşen kaldırılırken donma düzeltmesi #3324'ü
  içerir. Kaynakta bu eski renk çağrılarının kaldırıldığı doğrulandı.
- React Native 0.81.5, Expo 54, Hermes, yeni mimari, hedef SDK 36 ve
  `edgeToEdgeEnabled=true` korunmuştur. Güvenli alan bileşenleri korunmuştur.
- Yeni kaynak testi, paket/kilit/kurulu sürüm eşleşmesini, Screens'in eski
  renk API çağrılarını ve ekran/menü güvenli alanlarını kontrol eder.
- WhatsApp kimlik doğrulama, eşleştirme, kuyruk, sahiplik ve mesaj teslim
  davranışı değiştirilmedi. Worker'daki üç `let` → `const` lint düzeltmesi
  yukarıda ayrıca belirtilmiştir; canlı dağıtım yapılmadı.
- Bağımlılık mobil proje tarafından ortak kullanıldığından sonraki iOS paketi
  için de yerel yeniden derleme gerekir. Bu görevde iOS derlemesi/yayını yapılmadı.

Bu işlem **tüm Play Android 15 uyarılarının kapandığı anlamına gelmez**.
React Native, Expo görüntü seçici ve Material bağımlılıklarında kalan eski API
referansları ayrıca değerlendirilmelidir. Yeni paketin Play analizi ve gerçek
cihaz davranışı henüz doğrulanmamıştır.

Expo'nun sürüm kontrolü de tamamen yeşil değildir: mevcut kurulum için Expo
54.0.37, constants 18.0.14, file-system 19.0.24, local-authentication 17.0.9 ve
screen-capture 8.0.10 yama önerileri gösterdi. Screens için Expo 54 varsayılanı
4.16.0'dır; 4.18.0 bu Android düzeltmesi için bilinçli bir sapmadır. Bu uyarılar
gizlenmedi ve toplu SDK yükseltmesi yapılmadı. Cihaz testi özellikle gereklidir.

## Yerel kontroller

### Fiziksel cihaz kontrolü — 30 Ağustos, 14:53–14:57

USB hata ayıklama bağlantısı kullanıcı telefon ayarlarını değiştirdikten
sonra kuruldu. Cihazdaki uygulama kaldırılmadı, verileri temizlenmedi ve
herhangi bir APK kurulmadı. Mevcut oturum kullanıldı; inceleme hesabıyla
telefonda yeni giriş yapılmadı. WhatsApp yeniden eşleştirme, gerçek mesaj,
ilan yayımlama, satın alma veya silme işlemi yapılmadı.

| Kontrol | Sonuç |
| --- | --- |
| Cihaz | Samsung Galaxy A16 / SM-A165F, Android 16 / API 36, arm64-v8a |
| Ekran | 1080 × 2340, yoğunluk 450 dpi, font ölçeği 1.0 |
| Bellek sayfa boyutu | 4096 bayt; bu cihazda yapılan kontrol 16 KB çalışma testi değildir |
| Kurulu paket | `com.logivya.mobile`, **202 / 1.0.187**, yükleyici `com.android.vending` |
| Sıcak açılış | Activity `Status: ok`, 234 ms; bu sayı tüm ağ/veri yüklenme süresi değildir |
| Süreç kapatılıp yeniden açılış | Activity `COLD`, `Status: ok`, 469 ms; mevcut oturumla ana ekran geldi |
| Arka plandan dönüş | Activity `HOT`, `Status: ok`, 98 ms; aynı süreç çalışmaya devam etti |
| Menü ve kaydırma | Çekmece açıldı, Genel Bakış'a dönüldü, ilan listesi kaydırılabildi |
| Hata kaydı | Yeniden açılan uygulamanın PID'sine ait AndroidRuntime/ReactNativeJS hata filtresinde çıktı görülmedi; kapsamlı çökmesizlik kanıtı değildir |
| Klavye | **Başarısız:** ana ekran arama kutusu odaklandığında SwiftKey klavyesi kutuyu ve arama düğmesini kapatıyor |
| Alt menü metni | **Başarısız:** “Araç Bul - Paylaş” etiketi tek satırda kesiliyor |
| Alt içerik alanı | Alt menünün üstünde geniş boş şerit görülüyor; ekrandaki içerik bu şeridin üstünde kırpılıyor |
| İlan görünürlüğü | LOGIVYA kaynaklı 63, 68, 85 ve 110 saatlik ilan kartları göründü; bu, yeni WhatsApp mesajının anlık yayımlandığını kanıtlamaz |

İmza kontrolünde kurulu Play APK'sının SHA-256 sertifikası
`9B4B2464814BA51F66C927F5902E776D04D267348A073FA7AF26C8B1F4D3C68D`,
yerel 203 adayının yükleme sertifikası ise
`90ED684102500A915046DF804E9DB404CA61395819DC8DD025AC085D71FA6BA0`
çıktı. İmzalar farklı olduğu için yükleme anahtarıyla üretilecek yerel APK,
mevcut Play uygulamasının üzerine kurulmaya çalışılmadı. Mevcut kurulum ve
veriler korunarak yeni adayı test etme yolu, kalite kontrolleri sonrasında
Play test kanalı üzerinden Google'ın imzaladığı güncellemeyi almaktır.
Bu aşamada Play'e yükleme veya başvuru gönderimi yapılmadı.

Kaynak incelemesinde alt menü etiketi `numberOfLines={1}` ve `maxWidth: 72`
kullanıyor. Ortak `Screen` bileşeni ayrıca alt safe-area ve 18 birim alt
boşluk ekliyor. Bunlar yerleşim incelemesi için kayıt altına alındı;
bu cihaz kontrolü sırasında uygulama kaynak kodu değiştirilmedi.

Ekran kanıtları (yerel):

- `artifacts/device-qa/android-a16-20260830/02-menu.png`
- `artifacts/device-qa/android-a16-20260830/03-dashboard.png`
- `artifacts/device-qa/android-a16-20260830/04-keyboard.png`
- `artifacts/device-qa/android-a16-20260830/07-live-list.png`
- `artifacts/device-qa/android-a16-20260830/08-cold-launch.png`
- `artifacts/device-qa/android-a16-20260830/09-resume.png`

Test sona erdiğinde USB hata ayıklama kapatılmalı ve kullanıcı test için
kapattığı Otomatik Engelleyici'yi yeniden açmalıdır. Bu güvenlik ayarlarının
geri alınması uzaktan yapılmış sayılmadı; kullanıcıya hatırlatılmalıdır.

### Kaynak ve paket kontrolleri

Başarılı:

- `npm run typecheck --prefix apps/mobile`
- `node scripts/test-android-edge-to-edge-release.mjs`
- `node --import tsx scripts/test-release-blocking-mobile-regressions.ts`
- `node --import tsx scripts/test-mobile-product-experience.ts`
- `node --import tsx scripts/test-mobile-dashboard-security-parity.ts`
- `node --import tsx scripts/test-admin-message-privacy.ts`
- `node --import tsx scripts/test-message-media-contracts.ts`
- `node --import tsx scripts/test-mobile-whatsapp-directory-refresh.ts`
- `node --import tsx scripts/test-continuous-message-delivery-contracts.ts`
- `node scripts/test-android-compose-compatibility.mjs`
- `node scripts/test-android-backup-privacy.mjs`
- Kapalı test 198 paket karması ve mağaza varlıklarını salt okunur Play API
  sorgularıyla doğrulayan yayın durumu denetimi.

Derleme/kalite durumu:

- Web üretim derlemesi: **başarılı** (`npm run build`); TypeScript ve 317
  statik sayfa üretimi tamamlandı. PostgreSQL bağlantı kitaplığının gelecekteki
  SSL modu davranışıyla ilgili uyarısı vardı; bu görevde bağlantı ayarı değiştirilmedi.
- Son Android AAB üretimi ve imzalama: **başarılı**. Tam lint ile birleşik
  son Gradle komutu **exit 0**; lint **0 hata, 22 uyarı**. Önceki exit 1
  denemeleri aşağıda tanı geçmişi olarak tutulmaktadır.
- AAB doğrulaması: **31/31 başarılı**. Paket adı, 203/1.0.188 sürümü, SDK
  24/36/36, dört ABI, imza ve beklenen yükleme sertifikası, üretim API adresi,
  OAuth istemcileri, izinler ve gömülü gizli bilgi taraması doğrulandı.
- Ayrı 16 KB denetimi: AAB içindeki **44 adet 64-bit ELF kitaplığının** LOAD
  segment hizalaması en az 16384; dosya/sanal adres hizalamaları uyumlu ve
  GNU_RELRO mevcut. BundleConfig `PAGE_ALIGNMENT_16K` istiyor. Bu statik
  denetim, 16 KB cihazda çalışma testi yerine geçmez.
- **Önceki lint çökmesi — çözüldü:** `:expo-iap:lintAnalyzeRelease` içinde
  `ComposableCoroutineCreationDetector`, `ExpoIapModule.kt` analizinde
  `null cannot be cast to non-null type org.jetbrains.uast.UParameter`
  hatasıyla çöktü. Çözülmüş modelde Compose runtime 1.6.8, AGP 8.11.0 ve
  Kotlin 2.1.20 görülüyor. Bu bir analizör çökmesidir; uygulama çalışırken
  çökme yaşandığına kanıt değildir. Denetleyici kapatılmadı, hata bastırılmadı
  ve satın alma bağımlılığı yalnızca kontrolü geçirmek için değiştirilmedi.
  Compose runtime ailesi için 1.9.5 bağımlılık alt sınırı, önce modül lint
  deneyiyle sonra varsayılan K2 altında tam uygulama lint/derlemesiyle
  doğrulandı. Yukarıdaki Android analiz uyumluluğu bölümü güncel sonucu içerir.
- İlk lint girişimi Sentry yükleme tokenı olmadığı için durdu. Tekrarında,
  mevcut EAS üretim profilindeki `SENTRY_DISABLE_AUTO_UPLOAD=true` kullanıldı.
- İkinci lint girişiminde Kotlin ve dört ABI için Screens native derlemesi
  ilerledi; OneDrive native dosya bağlantılarını Gradle düzenli dosya olarak
  okuyamadığı için birleştirme aşaması durdu. Projedeki mevcut OneDrive init
  betiğiyle, geçici staging klasöründe tekrar başlatıldı.
- Staging denemesi `libfbjni.so` dosyasında da aynı WOF/reparse sorununu
  gösterdi. `onedrive-gradle-generated-assets.init.gradle` içindeki yalnızca
  `libc++_shared.so` için olan düzeltme, proje build klasörü altındaki üretilmiş
  tüm `.so` dosyalarına genişletildi. Her kopya bayt düzeyinde doğrulanır ve
  hedefin build klasörü içinde olduğu denetlenir; kaynaklar ve ortak bağımlılık
  önbelleği değiştirilmez. Son denemede Worklets'in 52 kitaplığı normal dosyaya
  dönüştürüldü; önceki hatalı dosyanın reparse niteliği kaldırıldığı doğrulandı.
- Android kaynak ön kontrolü 30 kontrolden 29'unu geçti. **Tek başarısızlık:
  izlenen kaynak ağacı temiz değil.** `LOGIVYA_RELEASE_ALLOW_DIRTY` açılmadı.
  Betiğin kirli ağaç için sabit yazdığı “override enabled only for local
  validation” açıklaması bir onay veya override kullanıldığına kanıt değildir.
- İlk `adb devices` kontrolleri boştu; 14:53 itibarıyla A16 bağlantısı kuruldu.
  Yukarıdaki **202** cihaz kontrolü, **203** adayı için test yerine geçmez.

## İlk üretilen yerel dosyalar — tarihçe, son aday değil

- AAB: `artifacts/releases/android-v203/logivya-v203-1.0.188-edge-to-edge-qa.aab`
- Boyut: 64.759.479 bayt.
- SHA-256: `CB00A611914AC3CA0F2F583CEADBA5DB4E603B60B3470F91E5A65F2D190F241E`
- Paket doğrulama raporu: `artifacts/releases/android-v203-release-manifest.json`
- Kaynak ön kontrol raporu: `artifacts/releases/android-v203-preflight.json`

Bu ilk AAB bir **QA adayıdır**; Play'e yüklenmiş veya üretim için kabul edilmiş
bir sürüm değildir ve sonraki düzeltmeleri içermez. Güncel dosya yukarıdaki
`lint-privacy-qa.aab` dosyasıdır. Paket raporundaki PASSED sonucu yalnızca
listelenen 31 kontrole aittir; fiziksel cihaz ve temiz kaynak kapılarını kapsamaz.

## Başvuru yanıtlarının yerel son taslağı

Son Uygula gönderimi yapılmadı. 17:28'deki önceki yazım reddinden sonra,
kullanıcı aşağıdaki ücretli test hesabı beyanını açıkça onayladı. 17:49–17:55
arasında dört bölüm açık formda güncellendi; Geri/İleri ile alanların
korunduğu tekrar okundu. Bu kez yazım başarılıdır, ancak bağımsız sekmede
yeniden açılan form eski beyanları getirdiğinden **sunucuda kalıcı kayıt
kanıtlanmadı**. Yalnızca kaydı zorlamak için son Uygula düğmesine basılmadı.
Düzeltilmiş form sekmesi kapatılmadan bırakıldı. Sekme kaybolursa aşağıdaki
yanıtlar yeniden girilmeli ve nihai gönderim öncesinde tekrar okunmalıdır.

### Test kullanıcılarını nereden buldunuz?

Kapalı test için Testers Community üzerinde ücretli test hesabı kullandık; 15 test kullanıcısıyla çalıştık.

### Test etkileşimi

15 test kullanıcısının katılımını Testers Community hesabından takip ettik. Özellik bazlı kullanım ölçümümüz bulunmadığından tüm özelliklerin gerçek lojistik operasyonları yoğunluğunda kullanıldığını iddia etmiyoruz.

### Geri bildirim

Geri bildirimleri Testers Community paneli ve PDF test raporundan aldık. Raporda kritik çökme bildirilmedi; mağaza açıklamasını geliştirme, yeni kullanıcı rehberi, özellik odaklı ekran görüntüleri ve parola göster/gizle düğmesi önerildi.

### Hedef kitle

Logivya; yük sahipleri, nakliyeciler, araç sahipleri, şoförler ve lojistik operasyon ekipleri içindir. Yük, araç ve şoför ilanları arayan veya paylaşan, taleplerine uygun fırsatları ve kendi WhatsApp hesapları üzerinden izinli iletişimini tek yerden yönetmek isteyen yetişkinleri hedefler.

### Kullanıcıya sağlanan değer

Logivya, yük, araç ve şoför ilanlarını arama ve paylaşmayı, taleplere uygun fırsatları takip etmeyi bir araya getirir. Kullanıcılar kendi WhatsApp hesap ve gruplarını yönetebilir, izinli mesajları planlayabilir ve gönderim sonuçlarını izleyebilir; lojistik işlerini tek panelden yürütür.

### Geri bildirime göre değişiklikler

Rapor önerilerini kaynak ve mağaza içeriğiyle karşılaştırdık. Parola göster/gizle düğmesi, yeniden açılabilen ilk kullanım rehberi, lojistik özelliklerini anlatan açıklamalar ve özellik odaklı ekran görüntüleri mevcut. Yeni Android adayında eski ekran API çağrıları için düzeltme hazırladık.

Bu yerel son öneri, önceki “rapor doğrultusunda eklendi” ifadesini daraltır:
özelliklerin varlığı doğrulandı; raporun bunların eklenmesine neden olduğu
ayrıca kanıtlanmadı. Bu 291 karakterlik ifade Console'da tekrar okundu.

### Hazırlık durumu — 17:55 açık formda doğrulandı, gönderilmedi

Kapalı test koşulları sağlandı; ücretli test hesabı kullandık. 203 sürümü Android cihazında sınandı. Onaylı gruptaki test yükünün otomatik yayını ve WhatsApp'tan silinince kaldırılması doğrulandı. İnceleme erişimi açık. Uzun süreli sağlık ve Google lansman öncesi rapor kontrolü henüz tamamlanmadı.

Bu 298 karakterlik yanıt açık formda tekrar okundu. “203” cihaz adedi değil,
Android sürüm kodudur. Kalıcı kayıt bağımsız sekmede doğrulanmadı; nihai
gönderim yapılmadı. Bu taslak tüm ürün işlevlerinin geçtiği şeklinde
sunulmamalıdır.

### Ek testte farklı yapılanlar

Testers Community'de ücretli test hesabı ve 15 katılımcıyla çalıştık. Ek test koşulu Console'da tamamlanmış görünüyor. Rapor önerilerini mağaza ve ilk kullanım deneyimiyle karşılaştırdık. İnceleme hesabının WhatsApp bağlantısını kurduk; gerçek test yükünün otomatik yayın ve silinmesini doğruladık.

Bu 298 karakterlik son alan da açık formda dolduruldu. Son Uygula düğmesi
kullanıcıya bırakıldı. Testçi bulma zorluğu “Zor” ve ilk yıl yükleme
tahmini “0–10 bin” olan önceki seçimler değiştirilmedi. Sekmeler arası
kalıcılık sorunu çözülmüş veya bu form Google'a gönderilmiş sayılmamalıdır.

Sağlayıcının raporu genel bulgulardır; sürüm/cihaz bazında yeni 203 adayının
uçtan uca geçtiğine kanıt olarak kullanılmamalıdır. Ücretli sağlayıcı
kullanılmadığı, yapılmayan görüşmeler, anketler veya ölçülmeyen özellik
kullanımları başvuruda iddia edilmemelidir.

## Gönderim öncesi kalan kapılar

Bu liste yeni **203** adayının yayın kalite kapılarıdır. Yerel kirli kaynak
ağacı, Google'ın mevcut **198** kapalı testine
dayalı üretime erişim başvurusunu teknik olarak kapattığı anlamına gelmez.
Console başvuru düğmesi açıktır. 203 dahili teste yüklenip sınırlı cihaz QA'sı
yapıldı; tamamlanmamış uçtan uca/uzun süreli kapılar geçmiş gösterilmemelidir.

1. **Tamamlandı:** Compose/UAST çökmesi ve iki somut lint hatası çözüldü;
   tam lint 0 hata/22 uyarı, son paketin AAB/imza/sürüm/izin/üretim adresi/
   gizli bilgi kalıpları kontrolleri 31/31. Gözlenen sınırlı 203 cihaz QA'sında
   crash/ANR görülmedi; bu, tüm cihazlarda veya uzun sürede hata yok demek değildir.
2. **Sınırlı cihaz QA tamamlandı:** 203 / Android 16 açılış, oturum koruma,
   üst/alt görünüm, çekmece, klavye, dosya seçici/iptal, geri dönüş ve
   iki kişilik onaylı gruba mesaj gönderme/silme. Gerçek kaynak test yükünün
   telefonda görünmesi ve kaynağı silinince kalkması kullanıcı tarafından
   doğrulandı; otomatik yayın/silme ayrıca normal servislerle kanıtlandı.
3. Yerel kaynak değişikliklerini gözden geçirip sürümü sabitle; mevcut kirli
   ağacı toplu commit ederek veya kontrolü devre dışı bırakarak geçme.
4. Uygun test kanalına doğrulanmış aday yüklenirse Google'ın yeni analizini ve
   lansman öncesi raporunu kontrol et. Sonucun oluşacağı garanti edilmemeli.
5. Başvuru hazırlık yanıtını eldeki sonuçlarla güncelle ve son gönderim
   kararı ver. Üretime erişim başvurusu, üretim yayını değildir.
6. **İşlevsel zincir tamamlandı:** buffer/pending/ACK düzeltmeleri sonrası
   gerçek test mesajının otomatik yayını, ilk test kartının kullanıcı
   telefonunda görünmesi ve kaynak silindiğinde pasifleştirilmesi doğrulandı.
   Test ilanları kaldırıldı. Yamalar yerel normal kurulum zincirine taşındı;
   genel sahiplik politikası henüz canlıya dağıtılmadı. Çalışan dar kapsamlı
   imajın uzun süre kabulü ve sonraki sabit sürüm dağıtımı ayrı kapıdır.
7. Sıkı worker/Redis soak kabulü FAIL kaldı. Eski imajdaki restart/kapanış
   geçmişi, yeni imajdaki decrypt hataları ve kümülatif 31 Redis kimlik
   doğrulama hatasının nedenini/tekrar durumunu kanıtla. Yeni imajı gerekli
   gerçek süre boyunca değerlendir; sayaç sıfırlama veya eşik gevşetmeyle
   kabul üretme.

## Kaynaklar

- Test geri bildirimi: `C:/Users/burak/Downloads/logivya_feedback.pdf`.
- `logivya_production.pdf` bir yanıt şablonudur; gerçek test kanıtı yerine kullanılmadı.
- [Google üretime erişim test gereklilikleri](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google test kanalları](https://support.google.com/googleplay/android-developer/answer/9845334)
- [Google lansman öncesi rapor](https://support.google.com/googleplay/android-developer/answer/9842757)
- [Android 15 kenardan kenara gösterim](https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge)
- [Android 16 KB hizalama ve cihaz doğrulaması](https://developer.android.com/guide/practices/page-sizes)
- [Screens eski API kaldırma düzeltmesi #3264](https://github.com/software-mansion/react-native-screens/pull/3264)
- [Screens 4.18.0 sürümü](https://github.com/software-mansion/react-native-screens/releases/tag/4.18.0)
- [Screens 4.18.0 React Native uyumluluk tablosu](https://github.com/software-mansion/react-native-screens/blob/4.18.0/README.md#supported-react-native-version)
- [AndroidX Compose Runtime sürüm notları](https://developer.android.com/jetpack/androidx/releases/compose-runtime)
- [AndroidX Compose lint yardımcı kodu](https://github.com/androidx/androidx/blob/androidx-main/compose/lint/common/src/main/java/androidx/compose/lint/ComposableUtils.kt)
