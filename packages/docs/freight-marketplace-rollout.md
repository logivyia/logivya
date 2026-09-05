# Yük Pazarı güvenli yayın planı

Yük Pazarı, mevcut WhatsApp ve mesajlaşma ürününden bağımsız bir modüldür. Veritabanı migrasyonu ve uygulama kodu üretime alınsa bile normal kullanıcılar için kendiliğinden açılmaz.

## Varsayılan erişim

- `freight_marketplace_public`: kapalı, yayın oranı `%0`. Normal üretim kullanıcıları hiçbir sekme veya API işlevi göremez.
- `freight_marketplace_internal`: açık, yayın oranı `%100`. Buna rağmen yalnızca etkin `PlatformAdmin` kaydı olan ve `SUPER_ADMIN` rolüne ya da `freight_marketplace_internal_access` iznine sahip kullanıcılar erişebilir.
- Bayraklar bulunamazsa veya erişim kontrolünde hata oluşursa modül kapalı kabul edilir.
- Mobil uygulama erişimi giriş yapan kullanıcı kimliğine bağlar; oturum değiştiğinde eski yetki taşınmaz.

## Dağıtım sırası

1. Normal veritabanı yedeğini ve migration ön kontrolünü tamamlayın.
2. `20260824213000_freight_marketplace_foundation` migrasyonunu uygulayın.
3. Backend ve yeni mobil uygulama sürümünü yayınlayın. Google Play kapalı test ayarları veya mevcut sürüm kodu bu geliştirmeyle değiştirilmez.
4. İç test hesabının etkin `PlatformAdmin` kaydını ve gerekli rol/izni doğrulayın.
5. Oluşturma, arama, detay, sahiplik, düzenleme ve durum geçişlerini iç testte doğrulayın.
6. Ürünü normal kullanıcılara açma kararı ayrıca ve açıkça verildiğinde public bayrağını kademeli olarak etkinleştirin.

## Yönetim API'si

Durum okuma:

```http
GET /api/admin/feature-flags/freight-marketplace
```

İç test oranını değiştirme örneği:

```json
{
  "internalEnabled": true,
  "internalRolloutPercentage": 100
}
```

Public erişimi ilk kez açmak için kritik yönetici iznine ek olarak aşağıdaki açık onay gerekir:

```json
{
  "publicEnabled": true,
  "publicRolloutPercentage": 5,
  "confirmation": "ENABLE_FREIGHT_MARKETPLACE_PUBLIC"
}
```

Bu işlem audit kaydına yazılır. Tarihe veya zamanlayıcıya bağlı otomatik açılma yoktur.

## Veri ve sorgu kararları

- Yükleme tarihi saatten bağımsız bir takvim günü olarak PostgreSQL `DATE` alanında saklanır. API biçimi `YYYY-MM-DD`'dir; doğrulama UTC takvim bileşenleriyle yapılır ve istemci yerel saat diliminde gün seçer.
- Varsayılan arama sırası önce en yakın yükleme tarihi, ardından en yeni ilan ve son olarak benzersiz ilan kimliğidir.
- Sorgular en fazla 50 kayıtla sınırlandırılır ve cursor ile devam eder. Varsayılan sayfa boyutu 20'dir.
- `status + loadingDate + createdAt`, `status + trailerType + loadingDate`, `ownerUserId + status + createdAt` ve şirket durum sorguları için bileşik indeksler bulunur. Normalize edilmiş başlangıç/varış alanları metin aramasını ve ileride daha gelişmiş konum sütunları eklenmesini destekler.

## Geri alma

Öncelikli ve veri kaybettirmeyen geri alma yöntemi `publicEnabled: false` ve gerekirse `internalEnabled: false` göndermektir. Böylece sekmeler yeniden sorgulamada kaybolur ve tüm fonksiyonel API uçları 404 ile kapalı davranır. İlan verileri silinmez. Şema migrasyonunu geri çevirmek yerine bayrakla kapatma tercih edilir.

## Doğrulama

```bash
npm run test:freight-marketplace
npm run typecheck
npm run mobile:typecheck
npm run test:stable-core
npm run build
```

Mobil kod değiştiği için Android release derlemesi ayrıca doğrulanmalıdır. Bu çalışma uygulama mağazalarına gönderim, rollout veya sürüm numarası değişikliği yapmaz.
