import type { ProductFeatureKey } from "@/config/product-content";

export type PublicProductPage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  paragraphs: readonly string[];
  bullets: readonly string[];
  audience: string;
  howItWorks: readonly string[];
  useCases: readonly string[];
  limitations: readonly string[];
  feature?: ProductFeatureKey;
};

export const PUBLIC_PRODUCT_PAGES = [
  page("logivya-nedir", "Logivya Nedir?", "Logivya'nın canlı lojistik pazarı, ilan, talep ve akıllı eşleştirme özelliklerini keşfedin.", "LOGIVYA", ["Logivya; yük, araç ve şoför ilanlarını tek merkezde buluşturan dijital lojistik platformudur.", "Genel lojistik, evden eve nakliyat, parsiyel yük ve ağır nakliyat süreçlerinde ilan yayınlama, fırsat bulma ve talep yönetimini destekler."], ["Tek bir canlı lojistik pazarı", "Yük, araç ve şoför ilanları", "Talep ve eşleşme bildirimleri", "WhatsApp ve Telegram ile operasyon yönetimi"]),
  page("canli-lojistik-pazari", "Canlı Lojistik Pazarı", "Güncel yük, araç ve şoför ilanlarını Logivya canlı lojistik pazarında takip edin.", "CANLI PAZAR", ["Aktif lojistik ilanları tek akışta görüntülenir ve durum değişiklikleri aynı ilan kimliğine uygulanır.", "Sektörel ilanlar ilgili özel pazarda görünürken genel pazar kapsamını da korur."], ["Güncel ilan akışı", "Rota ve araç tipi araması", "Tekil ve güncel ilan kimliği", "Sektörel filtreler"], "GENERAL_MARKETPLACE"),
  page("akilli-eslestirme", "Akıllı Eşleştirme", "Yük, araç veya şoför talebinizi kaydedin; uyumlu ilanlar bulunduğunda sonuçları takip edin.", "AKILLI TALEP", ["Talep kriterleri ilan türü, rota, tarih, kapasite ve sektör uyumluluğu gibi kurallarla değerlendirilir.", "Bilinmeyen bilgiler yanlış eşleşme kabul edilmez; zorunlu koşullar ve açıklanabilir puanlama birlikte kullanılır."], ["Açıklanabilir eşleşme puanı", "Sektör uyumluluğu", "Tekrarlanan bildirim koruması", "Talep bazlı sonuç yönetimi"], "INTELLIGENT_MATCHING"),
  page("yuk-paylas", "Yük Paylaş", "Taşınacak yükünüz için rota, tarih, araç tipi ve iletişim bilgileriyle ilan yayınlayın.", "YÜK İLANI", ["Yük ilanınızı gerekli taşıma bilgileriyle oluşturun; ilan aynı kimlikle genel ve ilgili sektör akışlarında yönetilsin."], ["Rota ve yükleme tarihi", "Yük ve araç gereksinimi", "Fiyat ve iletişim bilgisi", "İlan durumu yönetimi"], "GENERAL_MARKETPLACE"),
  page("yuk-bul", "Yük Bul", "Rotanıza ve aracınıza uygun güncel yük ilanlarını arayın.", "YÜK ARAMA", ["Çıkış, varış, tarih, araç tipi ve ağırlık filtreleriyle aktif yükleri bulun."], ["Rota filtresi", "Tarih ve araç tipi", "Sektör kapsamı", "Güncel ilanlar"], "GENERAL_MARKETPLACE"),
  page("arac-paylas", "Araç Paylaş", "Boş veya uygun aracınızı rota, kapasite ve tarih bilgileriyle yayınlayın.", "ARAÇ İLANI", ["Araç uygunluğunu yayınlayarak yük sahiplerinin sizi bulmasını sağlayın."], ["Konum ve rota", "Uygunluk dönemi", "Araç tipi ve kapasite", "Uluslararası ve ADR bilgisi"], "GENERAL_MARKETPLACE"),
  page("arac-bul", "Araç Bul", "Yükünüze uygun aktif araç ilanlarını konum, rota ve ekipman bilgileriyle bulun.", "ARAÇ ARAMA", ["Güncel araç ilanlarını sektör ve taşıma gereksinimlerinize göre filtreleyin."], ["Konum ve hedef rota", "Araç tipi", "Kapasite", "Sektörel uyumluluk"], "GENERAL_MARKETPLACE"),
  page("sofor-ilani", "Şoför İlanı Ver", "Şoför arama veya çalışmaya uygunluk ilanınızı yayınlayın.", "ŞOFÖR İLANI", ["Ehliyet, deneyim, çalışma biçimi ve uygunluk bilgilerini tek ilanda yönetin."], ["Şoför aranıyor veya şoför uygun", "Ehliyet sınıfları", "Deneyim ve belgeler", "Çalışma biçimi"], "GENERAL_MARKETPLACE"),
  page("sofor-bul", "Şoför Bul", "Uygun şoförleri ve güncel şoför arama ilanlarını bulun.", "ŞOFÖR PAZARI", ["Konum, ehliyet, deneyim ve çalışma biçimine göre şoför ilanlarını arayın."], ["Konum araması", "Ehliyet sınıfı", "Uluslararası deneyim", "ADR ve mesleki belgeler"], "GENERAL_MARKETPLACE"),
  page("ilanlarim", "İlanlarım", "Yük, araç ve şoför ilanlarınızı tek ekrandan yönetin.", "İLAN YÖNETİMİ", ["Aktif, tamamlanan ve pasif ilanlarınızı görüntüleyin; uygun durum geçişleriyle güncel tutun."], ["Yük ilanları", "Araç ilanları", "Şoför ilanları", "Düzenleme ve durum yönetimi"], "GENERAL_MARKETPLACE"),
  page("talep-olustur", "Talep Oluştur", "Aradığınız yük, araç veya şoför için kriterlerinizi kaydedin.", "TALEP MERKEZİ", ["Talebiniz aktif kaldığı sürece yeni fırsatlar kriterlerinize göre değerlendirilir."], ["Esnek kriterler", "Sektörel talep kapsamı", "Eşleşme sonuçları", "Bildirim tercihi"], "SAVED_DEMANDS"),
  page("evden-eve-nakliyat", "Evden Eve Nakliyat", "Ev ve ofis taşıma ilanlarını yayınlayın, uygun taşıyıcıları bulun ve taleplerinizi yönetin.", "SEKTÖREL PAZAR", ["Evden eve pazarı; ev, ofis, eşya, paketleme, montaj ve taşıma hizmetleri için sektör bağlamını korur."], ["Alış ve teslim konumu", "Taşınma tarihi", "Kat ve asansör bilgisi", "Paketleme ve montaj ihtiyacı"], "HOME_MOVING"),
  page("parsiyel-yuk", "Parsiyel Yük", "Parsiyel ve parça yük ilanlarını yayınlayın, uygun kapasiteyi bulun ve eşleşmeleri yönetin.", "SEKTÖREL PAZAR", ["Parsiyel pazar; grupaj, LTL, palet, koli ve paylaşımlı kapasite fırsatlarını genel yüklerden ayırır."], ["Rota ve tarih", "Ağırlık, hacim veya palet", "Teslim biçimi", "Ulusal veya uluslararası taşıma"], "PARTIAL_LOAD"),
  page("agir-nakliyat", "Ağır Nakliyat", "Ağır, gabari dışı ve proje taşımalarını yayınlayın, uygun araç ve hizmetleri bulun.", "SEKTÖREL PAZAR", ["Ağır nakliyat pazarı; lowbed, iş makinesi, proje yükü, izin, eskort ve ekipman gereksinimlerini sektör bağlamında tutar."], ["Yük ve makine türü", "Boyut ve ağırlık", "Lowbed ve ekipman", "İzin, eskort ve rota gereksinimi"], "HEAVY_HAUL"),
  page("whatsapp-yonetimi", "WhatsApp Yönetimi", "Sahibi olduğunuz WhatsApp hesaplarını ve gruplarını Logivya'da güvenli biçimde yönetin.", "ÇOK KANALLI İLETİŞİM", ["Hesap, grup ve mesaj verileri kullanıcı sahipliği sınırları içinde işlenir; başka kullanıcıların grupları yönetim ekranına sızdırılmaz."], ["Kullanıcıya ait hesaplar", "Grup senkronizasyonu", "Metin ve medya gönderimi", "Mesaj geçmişi ve teslim durumu"], "WHATSAPP_ACCOUNTS"),
  page("telegram-yonetimi", "Telegram Yönetimi", "Telegram hesap, sohbet ve paylaşım akışlarını Logivya üzerinden yönetin.", "ÇOK KANALLI İLETİŞİM", ["Telegram özelliği yayın durumuna göre beta veya genel kullanım etiketiyle sunulur."], ["Hesap bağlantısı", "Sohbet ve grup seçimi", "Metin ve medya", "Lojistik fırsat akışı"], "TELEGRAM_ACCOUNTS"),
  page("facebook-sayfalari", "Facebook Sayfaları", "Facebook Sayfaları entegrasyonunun kullanılabilirlik ve sağlayıcı onayı durumunu görün.", "SAĞLAYICIYA BAĞLI", ["Facebook Sayfaları özelliği yalnızca Meta yapılandırması, gerekli izinler ve uygulama incelemesi tamamlandığında genel kullanıma açılır."], ["Resmî Meta OAuth", "Yönetilen Sayfa seçimi", "Gönderi ve medya yayını", "Bağlantı ve izin yönetimi"], "FACEBOOK_PAGES"),
  page("mesaj-otomasyonu", "Mesaj Otomasyonu", "Planlı ve tekrarlanan iletişim akışlarını kontrollü biçimde yönetin.", "OPERASYON", ["Mesaj otomasyonları hesap sahipliği, abonelik, gönderim kuyruğu ve platform sınırlarına uygun olarak çalışır."], ["Planlı mesaj", "Tekrarlanan mesaj", "Gönderim kuyruğu", "Teslim durumu"], "WHATSAPP_ACCOUNTS"),
  page("canli-ilanlar", "Canlı İlanlar", "Yeni ve güncellenen lojistik ilanlarını canlı akışta takip edin.", "CANLI AKIŞ", ["Canlı akış aktif ve süresi dolmamış ilanları gösterir; güncelleme, pasife alma ve eşleşme olaylarını aynı ilan üzerinde işler."], ["Aktif ilan anlık görüntüsü", "Artımlı güncellemeler", "Süre dolumu", "Kaynak bilgisi"], "LIVE_LISTINGS"),
  page("fiyatlandirma", "Logivya Fiyatlandırma", "Logivya 7 Gün Ücretsiz, Logivya Plus ve Logivya Pro planlarını karşılaştırın.", "PLANLAR", ["Logivya 7 Gün Ücretsiz ile ürünü deneyin. Plus planı aylık 280 TL ve 2 kullanıcı; Pro planı aylık 380 TL ve 3 kullanıcı kapasitesi sunar."], ["7 günlük ücretsiz deneme", "Logivya Plus: 280 TL/ay, 2 kullanıcı", "Logivya Pro: 380 TL/ay, 3 kullanıcı", "Aylık ve yıllık seçenekler"]),
  page("hakkimizda", "Logivya Hakkında", "Logivya'nın lojistik operasyonlarını tek merkezde buluşturan ürün yaklaşımını öğrenin.", "HAKKIMIZDA", ["Logivya, lojistik ilanları ile iletişim kanallarını güvenli, açıklanabilir ve ölçeklenebilir bir ürün deneyiminde birleştirmek için geliştirilir."], ["Lojistik odaklı ürün", "Güvenli veri sahipliği", "Açıklanabilir eşleştirme", "Çok kanallı operasyon"]),
  page("sss", "Sık Sorulan Sorular", "Logivya'nın ilan, eşleştirme, WhatsApp, Telegram, sektör ve plan özellikleri hakkında yanıtlar.", "SSS", ["Logivya'da yük, araç ve şoför ilanları yayınlanabilir; talepler uygun ilanlarla eşleştirilir.", "Sektörel pazarlar aynı ilanı kopyalamaz; ilgili ilan aynı kimlikle genel ve sektör akışında görünür.", "Sağlayıcıya bağlı özellikler gerekli izin ve yapılandırmalar tamamlanmadan genel kullanıma açılmaz."], ["İlanlar nasıl yayınlanır?", "Akıllı eşleştirme nasıl çalışır?", "Sektörel pazarlar ilanları çoğaltır mı?", "Bağlı hesap verileri nasıl ayrıştırılır?"]),
] as const satisfies readonly PublicProductPage[];

export const PUBLIC_PRODUCT_PAGE_MAP = new Map(PUBLIC_PRODUCT_PAGES.map((item) => [item.slug, item]));

function page(
  slug: string,
  title: string,
  description: string,
  eyebrow: string,
  paragraphs: readonly string[],
  bullets: readonly string[],
  feature?: ProductFeatureKey,
): PublicProductPage {
  return {
    slug,
    title,
    description,
    eyebrow,
    paragraphs,
    bullets,
    audience: `${title}; yük sahibi, taşıyıcı, filo yöneticisi, operasyon ekibi ve uygun lojistik fırsatını arayan işletmeler için hazırlanmıştır.`,
    howItWorks: [
      paragraphs[0] ?? description,
      "Kullanıcı kendi hesabı ve şirket alanı içinde gerekli bilgileri girer; Logivya yetki, yayın durumu ve geçerli plan kurallarını sunucu tarafında doğrular.",
    ],
    useCases: bullets.slice(0, 3).map((bullet) => `${bullet} gerektiren lojistik operasyonları.`),
    limitations: [
      "Sonuçların kapsamı, kullanıcı tarafından girilen bilgiler ile o anda aktif ve yayınlanabilir ilanlara bağlıdır.",
      "Sağlayıcı bağlantıları ve beta özellikler, ilgili izinler veya yayın durumu tamamlanmadığında sınırlı olabilir.",
    ],
    ...(feature ? { feature } : {}),
  };
}
