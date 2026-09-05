# Logivya Canlı Pazar, Arapça ve Yayın Paketi — Master Uygulama Şartnamesi

## Amaç

Logivya'nın WhatsApp kaynaklı canlı lojistik pazarını yüksek hacimde güvenilir çalıştırmak; web ve mobil deneyimini sadeleştirmek; ağır nakliyat görsel dilini yenilemek; Arapça ve sağdan sola kullanım desteğini eksiksiz eklemek; kamusal ve hukuki metinleri tutarlı bir yapıda güncellemek; doğrulanan sürümleri web, Google Play dahili test ve App Store Connect taslak build kanallarına hazırlamaktır.

## Değişmez ürün kuralları

- WhatsApp'ta bağlı ve otomatik yayıma onaylı tüm gruplardaki uygun lojistik iletileri işlenir; sabit 5, 6, 12, 100 veya 200 ilanlık görünürlük kesintisi uygulanmaz.
- WhatsApp kaynaklı yayımlanan ilanlar, kaynak ileti silinmedikçe veya açıkça devre dışı bırakılmadıkça kaynak zamanından itibaren tam 36 saat canlı kalır.
- Aynı kaynak ileti yeniden işlendiğinde yeni kopya üretmek yerine aynı ilan güncellenir; kaynak ileti silinirse ilgili ilan da pasifleştirilir.
- Bir grup ilanında kamusal ilan sahibi olarak grup adı değil, güvenli biçimde çözümlenebilen gerçek gönderici görünen adı kullanılır. Bu ad şifreli saklanır; telefon/JID veya sistem yöneticisi adı kamusal ad olarak sızdırılmaz.
- Kullanıcı, şirket ve grup izolasyonu ile mesaj gönderme, silme ve geçmiş akışlarının mevcut kararlı davranışı korunur.

## Web ve mobil deneyim

- Ana sayfadaki yinelenen “Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu” tanıtım bloğu kaldırılır.
- Fiyatlandırmada genel kullanıcı açıklaması kaldırılır; özellik listelerinde yalnızca yeşil onay işareti ve kısa özellik başlığı kalır.
- iyzico alanı güven, ödeme kapsamı, kart verisinin Logivya tarafından saklanmaması ve web/mağaza satın alımı ayrımını sade biçimde anlatır.
- Ağır nakliyat simgesi web ve mobilde aynı, gerçek bir çekici ile alçak şasili lowbed treyleri temsil eden özgün vektör simge olur.
- Araç Bul / Araç Paylaş formları dar ekranlarda tek sütuna iner; alanlar, sekmeler, klavye ve alt gezinme birbirini örtmez; uzun içerik güvenli alt boşlukla kaydırılır.

## Dil ve erişilebilirlik

- Arapça (`ar`) web ve mobilde seçilebilir birinci sınıf dil olur.
- Bütün çeviri anahtarları Arapça kataloğunda bulunur; eksik anahtar veya İngilizce geri dönüş bırakılmaz.
- Arapça seçildiğinde belge ve uygulama yönü RTL olur; ikon, form, metin hizası ve yönsel gezinme davranışı denetlenir.
- Mevcut diller ve Türkçe/İngilizce ana katalogları geriye dönük uyumlu kalır.

## Kamusal ve hukuki içerik

- Gizlilik Politikası, Kullanım Koşulları, Çerez Politikası, KVKK Aydınlatma Metni, Veri İşleme Sözleşmesi, Teslimat ve İade, Logivya Nedir ve SSS sayfaları kapsam, tanım, taraf rolleri, veri işleme, güvenlik, saklama, aktarım, kullanıcı hakları, ödeme, abonelik, fesih, cayma/iade, uyuşmazlık ve iletişim başlıkları bakımından tutarlı hale getirilir.
- Metinler gerçek ürün akışını yansıtır; mutlak güvenlik, mutlak hukuki koruma veya mevzuatın izin vermediği hak feragati vaat etmez.
- Web, App Store ve Google Play ödemelerinin ilgili kanal kurallarına tabi olduğu açıkça ayrılır.
- Yayın öncesi metinler teknik ve içerik kontrolünden geçer; nihai hukuki uygunluk için Türkiye'de yetkili avukat incelemesi önerilir.

## Doğrulama ve yayın ölçütleri

- Prisma şeması ve migration güvenli biçimde uygulanabilir olmalıdır.
- WhatsApp yakalama, otomatik grup alma, ilan yayımlama, gönderen adı, 36 saat TTL, kaynakta silme ve tekrar işleme testleri geçmelidir.
- Web typecheck, production build, mobil typecheck ve Android release bundle başarılı olmalıdır.
- Fiziksel Android cihazda giriş, canlı ilan listesi, ilan detayı, Araç Bul / Araç Paylaş, ağır nakliyat simgesi, Arapça/RTL, WhatsApp bağlı durumu, mesaj gönderme ve herkesten silme regresyonları doğrulanmalıdır.
- Web doğrulandıktan sonra üretime dağıtılır.
- Android paketi yalnızca Google Play dahili test kanalına yüklenir; kapalı test kanalına gönderilmez.
- iOS paketi App Store Connect'e yalnızca yeni taslak build olarak yüklenir; incelemedeki mevcut sürüm sonuçlanmadan incelemeye gönderilmez.

