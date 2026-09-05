import arDictionary from "./locales/ar.json";
import azDictionary from "./locales/az.json";
import bgDictionary from "./locales/bg.json";
import deDictionary from "./locales/de.json";
import elDictionary from "./locales/el.json";
import roDictionary from "./locales/ro.json";
import ruDictionary from "./locales/ru.json";
import srDictionary from "./locales/sr.json";
import tkDictionary from "./locales/tk.json";
import { fallbackLocale, localeMetadata, normalizeLocale, type Locale } from "./config";

const baseTranslations = {
  tr: {
    teamAddUser: "Kullanıcı Ekle",
    loginTitle: "Tekrar hoş geldiniz",
    loginSubtitle: "Logivya hesabınızla oturum açın.",
    or: "Veya",
    continueWithGoogle: "Google ile devam et",
    continueWithApple: "Apple ile devam et",
    socialLoginFailedTitle: "Giriş tamamlanamadı",
    socialLoginFailed: "Google veya Apple hesabınız doğrulanamadı. Lütfen tekrar deneyin.",
    socialLoginInProgress: "Güvenli giriş tamamlanıyor...",
    socialProviderUnavailable: "Bu giriş yöntemi şu anda kullanılamıyor. Lütfen tekrar deneyin.",
    socialLoginNotConfigured: "Bu giriş yöntemi henüz yapılandırılmadı.",
    socialAccountNotFound: "Bu e-posta adresiyle eşleşen aktif bir Logivya hesabı bulunamadı. Önce mevcut hesabınızla kayıt olun veya giriş yapın.",
    socialPasswordRequired: "Bu hesapta ilk parola değişikliği bekliyor. Geçici parolanızla bir kez giriş yapın.",
    registerTitle: "Hesap oluşturun",
    forgotPasswordTitle: "Parolanızı sıfırlayın",
    resetPasswordTitle: "Yeni parola belirleyin",
    emailOrPhone: "E-posta veya telefon",
    email: "E-posta",
    password: "Parola",
    showPassword: "Parolayı göster",
    hidePassword: "Parolayı gizle",
    passwordPolicy: "Şifreniz en az 8 karakter olmalıdır.",
    passwordRequired: "Şifre gereklidir.",
    passwordTooShort: "Şifre en az 8 karakter olmalıdır.",
    passwordConfirmationMismatch: "Şifreler eşleşmiyor.",
    passwordInvalidType: "Şifre metin biçiminde olmalıdır.",
    login: "Giriş yap",
    register: "Kayıt ol",
    forgotPassword: "Parolamı unuttum",
    dashboard: "Kontrol Paneli",
    whatsapp: "WhatsApp",
    whatsappAccounts: "WhatsApp Yönetimi",
    telegramAccounts: "Telegram Yönetimi",
    facebookPages: "Facebook Yönetimi",
    accountsTab: "Hesaplar",
    historyTab: "Geçmiş",
    telegramAccountsDescription: "Telegram hesaplarınızı bağlayın, sohbetleri eşitleyin ve gönderimleri tek çalışma alanından yönetin.",
    groups: "Gruplar",
    whatsAppGroupsMetric: "WhatsApp Grupları",
    users: "Kullanıcılar",
    categories: "Kategoriler",
    messaging: "Mesaj Gönder",
    support: "Destek",
    freightMarketplace: "Yük Pazarı",
    createLoad: "Yük Paylaş",
    findLoads: "Yük Bul",
    myListings: "İlanlarım",
    createLoadDescription: "Taşıma ihtiyacınızı yayınlayın ve uygun taşıyıcılara ulaşın.",
    findLoadsDescription: "Güncel yük ilanlarını rota ve taşıma ayrıntılarına göre bulun.",
    myListingsDescription: "Yayınladığınız yük ilanlarını ve durumlarını yönetin.",
    logisticsMarketplace: "Logivya Lojistik Pazarı",
    homeMovingMarketplace: "Evden Eve Nakliyat",
    partialLoadMarketplace: "Parsiyel Yük",
    heavyHaulMarketplace: "Ağır Nakliyat",
    homeMovingMarketplaceDescription: "Ev ve ofis taşıma ilanlarını yayınlayın, uygun taşıyıcıları bulun ve taleplerinizi yönetin.",
    partialLoadMarketplaceDescription: "Parsiyel ve grupaj yükleri yayınlayın, uygun kapasiteyi bulun ve eşleşmeleri yönetin.",
    heavyHaulMarketplaceDescription: "Ağır, gabari dışı ve proje taşımalarını yayınlayın; uygun araç ve hizmetleri bulun.",
    facebookPagesMenuDescription: "Facebook sayfalarınızı bağlayın, gönderi oluşturun ve geçmişi yönetin.",
    logisticsSector: "Lojistik sektörü",
    logisticsSectorDemandDescription: "Talebin hangi pazarda eşleştirileceğini seçin.",
    listingSector: "İlan sektörü",
    sectorSelectionLocked: "Bu sektörel alandan geldiğiniz için sektör seçimi korunur.",
    showFields: "Alanları göster",
    hideFields: "Gizle",
    advertiser: "İlan veren",
    listingSourceLabel: "İlan Kaynağı",
    loadingLabel: "YÜKLEME",
    deliveryLabel: "TESLİM",
    sectorFilter: "Sektör",
    generalLogistics: "Genel Lojistik",
    marketplaceDashboardTitle: "Taşımanın ihtiyaç duyduğu her şey tek yerde",
    marketplaceDashboardDescription: "Yükünüzü veya boş aracınızı paylaşın; uygun yükü, aracı ya da şoförü hızlı ve güvenli biçimde bulun.",
    marketplaceSafetyTitle: "Güvenlik ve bildirim",
    marketplaceSafetyDescription: "Kurallara aykırı ilanları Logivya ekibine bildirebilir veya ilan sahibini engelleyebilirsiniz.",
    marketplaceSafetyReportSubject: "Pazar yeri ilan bildirimi: {title}",
    reportListing: "İlanı bildir",
    reportListingConfirm: "Bu ilan incelenmek üzere Logivya destek ve moderasyon ekibine gönderilecek. Devam edilsin mi?",
    reportSubmittedTitle: "Bildiriminiz alındı",
    reportSubmittedDescription: "İlan moderasyon ekibine iletildi ve kullanım kurallarına göre incelenecek.",
    reportListingFailed: "İlan şu anda bildirilemedi. Lütfen tekrar deneyin veya Destek bölümünden bize ulaşın.",
    blockMarketplaceUser: "İlan sahibini engelle",
    blockMarketplaceUserConfirm: "{name} tarafından yayınlanan yük, araç ve şoför ilanları bu cihazdaki hesabınız için gizlenecek. Devam edilsin mi?",
    marketplaceUserBlockedTitle: "İlan sahibi engellendi",
    marketplaceUserBlockedDescription: "Bu kullanıcının pazar yeri ilanları artık arama sonuçlarınızda gösterilmeyecek.",
    unblockMarketplaceUser: "Engeli kaldır",
    marketplaceUserUnblockedTitle: "Engel kaldırıldı",
    marketplaceUserUnblockedDescription: "Bu kullanıcının uygun ilanları yeniden arama sonuçlarında gösterilecek.",
    whatAreYouLookingFor: "Ne arıyorsunuz?",
    marketplaceSearch: "Lojistik pazarında ara",
    marketplaceSearchHint: "Şehir, rota, araç tipi veya şoför niteliğiyle arama yapabilirsiniz.",
    searchLoadPlaceholder: "Örn. İstanbul → Ankara yükü",
    searchVehiclePlaceholder: "Örn. İzmir tenteli araç",
    searchDriverPlaceholder: "Örn. İstanbul CE şoför",
    quickActions: "Hızlı işlemler",
    quickActionsDescription: "İhtiyacınız olan işlemi seçin ve hemen başlayın.",
    load: "Yük",
    vehicle: "Araç",
    driver: "Şoför",
    dashboardCreateLoadDescription: "Taşınacak yük için ilan yayınlayın.",
    dashboardFindLoadsDescription: "Rotanıza uygun güncel yükleri bulun.",
    dashboardShareVehicleDescription: "Boş aracınızın rota ve uygunluk bilgisini paylaşın.",
    dashboardFindDriverDescription: "Uygun şoförleri bulun veya şoför ilanı yayınlayın.",
    dashboardMyListingsDescription: "Tüm yük, araç ve şoför ilanlarınızı yönetin.",
    demandCenter: "Talep Merkezi",
    createDemandRequest: "Talep Oluştur",
    createDemandRequestDashboardDescription: "Aradığınız yük, araç veya şoför yayınlandığında anında bildirim alın.",
    createDemandRequestDescription: "İhtiyacınızı bir kez tanımlayın; Logivya uygun ilanları sizin için takip etsin.",
    myDemandRequests: "Taleplerim",
    myDemandRequestsDescription: "Aktif takiplerinizi, bulunan ilanları ve talep durumlarını yönetin.",
    demandRequestsLoadFailed: "Talepler alınamadı.",
    demandRequestUpdateFailed: "Talep durumu güncellenemedi.",
    demandRequestCreateFailed: "Talep oluşturulamadı.",
    demandRequestCreatedTitle: "Talebiniz aktif",
    demandRequestCreatedDescription: "Uygun yeni ilanlar yayınlandığında size bildirim göndereceğiz.",
    demandRequestUpdatedTitle: "Talebiniz güncellendi",
    demandRequestUpdatedDescription: "Yeni kriterler kaydedildi ve eşleştirme güncel bilgilerle devam edecek.",
    demandRequestCreatedWithMatches: "Talebiniz etkinleştirildi ve şimdiden {count} uygun ilan bulundu.",
    smartMatchingStartedDescription: "Talebiniz kaydedildi. Akıllı eşleştirme arka planda başlatıldı; ekranı kapatsanız da arama devam edecek.",
    smartMatchingTitle: "Akıllı eşleştirme",
    smartMatchingStatusQUEUED: "Arama sıraya alındı",
    smartMatchingStatusRUNNING: "Uygun sonuçlar aranıyor",
    smartMatchingStatusPARTIAL: "Arama kısmen tamamlandı",
    smartMatchingStatusCOMPLETED: "Arama tamamlandı",
    smartMatchingStatusFAILED: "Arama tamamlanamadı",
    smartMatchingStatusCANCELLED: "Arama iptal edildi",
    smartMatchingProgressCounts: "{groups} grup · {messages} mesaj · {matches} sonuç",
    matchSourceLOGIVYA: "Logivya",
    matchSourceWHATSAPP: "WhatsApp",
    matchSourceTELEGRAM: "Telegram",
    foundInMultipleSources: "{count} kaynakta bulundu",
    saveMatch: "Kaydet",
    dismissMatch: "İlgilenmiyorum",
    demandMatchStatusUpdateFailed: "Sonuç durumu güncellenemedi.",
    contactOnTelegram: "Telegram'da iletişime geç",
    noDemandRequests: "Henüz talebiniz yok",
    noDemandRequestsDescription: "Yük, araç veya şoför ihtiyacınızı kaydedip otomatik eşleşmeleri başlatın.",
    whatDoYouNeed: "Neye ihtiyacınız var?",
    demandKindDescription: "Takip etmek istediğiniz ilan türünü seçin.",
    demandRequestTitle: "Talep adı",
    demandRequestTitlePlaceholder: "Örn. İstanbul–Ankara tenteli araç",
    demandKeywordsOptional: "Anahtar kelimeler (isteğe bağlı)",
    demandKeywordsPlaceholder: "Virgülle ayırın: frigorifik, parsiyel",
    routeAndCapacity: "Rota ve kapasite",
    routeAndCapacityDescription: "Yalnızca önemli kriterleri girin; boş bıraktıklarınız esnek kabul edilir.",
    demandVehicleCategoryOptional: "Araç kategorisi (isteğe bağlı)",
    demandVehicleBodyLengthOptional: "Kasa uzunluğu, metre (isteğe bağlı)",
    demandVehicleBodyLengthInvalid: "Kasa uzunluğu 0 ile 40 metre arasında geçerli bir sayı olmalıdır.",
    demandRequiredPlateCountryOptional: "Gerekli plaka ülkesi (isteğe bağlı)",
    demandTransitRouteOptional: "Transit rota (isteğe bağlı)",
    fromOptional: "Nereden (isteğe bağlı)",
    cityOrRegion: "Şehir veya bölge",
    freightTrailerTypeOptional: "Araç tipi (isteğe bağlı)",
    allTrailerTypes: "Tüm araç tipleri",
    clearTrailerSelection: "Araç tipi seçimini temizle",
    minimumWeightOptional: "En az ton (isteğe bağlı)",
    maximumWeightOptional: "En fazla ton (isteğe bağlı)",
    internationalTransportRequired: "Uluslararası taşıma gerekli",
    internationalTransportRequiredDescription: "Yalnızca uluslararası çalışabilen araçlar eşleşir.",
    adrRequired: "ADR gerekli",
    adrRequiredDescription: "Yalnızca ADR taşımaya uygun araçlar eşleşir.",
    driverCriteria: "Şoför kriterleri",
    driverCriteriaDescription: "Konum, ehliyet ve çalışma biçimini ihtiyacınıza göre seçin.",
    driverLocationOptional: "Şoför konumu (isteğe bağlı)",
    matchingDriverListingType: "Eşleşecek ilan türü",
    driverLicenseClassesOptional: "Ehliyet sınıfları (isteğe bağlı)",
    driverEmploymentTypeOptional: "Çalışma biçimi (isteğe bağlı)",
    clearEmploymentSelection: "Çalışma biçimini temizle",
    internationalExperienceRequired: "Uluslararası deneyim gerekli",
    internationalExperienceRequiredDescription: "Yalnızca uluslararası deneyimli şoförler eşleşir.",
    driverAdrRequiredDescription: "Yalnızca ADR belgesi bulunan şoförler eşleşir.",
    demandDateRange: "Uygunluk dönemi",
    demandDateRangeDescription: "İlanın hangi tarih aralığına uygun olması gerektiğini belirleyin.",
    availableFromOptional: "Başlangıç (isteğe bağlı)",
    anyDate: "Herhangi bir tarih",
    clearDate: "Tarihi temizle",
    done: "Bitti",
    demandExpiryNotice: "Talep 30 gün boyunca aktif kalır. İstediğiniz zaman duraklatabilir veya tamamlayabilirsiniz.",
    activateDemandRequest: "Talebi etkinleştir",
    demandRequestTitleRequired: "En az 3 karakterlik açıklayıcı bir talep adı girin.",
    demandRequestCriteriaRequired: "Bildirimlerin doğru olabilmesi için en az bir eşleşme kriteri seçin.",
    demandKindLOAD: "Yük talebi",
    demandKindVEHICLE: "Araç talebi",
    demandKindDRIVER: "Şoför talebi",
    demandStatusACTIVE: "Aktif",
    demandStatusPAUSED: "Duraklatıldı",
    demandStatusFULFILLED: "Tamamlandı",
    demandStatusEXPIRED: "Süresi doldu",
    matchingListings: "Uygun ilanlar",
    viewMatches: "Eşleşmeleri gör",
    pauseDemand: "Duraklat",
    reactivateDemand: "Yeniden etkinleştir",
    completeDemand: "Tamamla",
    demandMatchesLoadFailed: "Uygun ilanlar alınamadı.",
    demandMatchesDescription: "Talep kriterlerinize uyan ilanlar en yüksek uyumdan başlayarak burada gösterilir.",
    noDemandMatches: "Henüz uygun ilan bulunmadı",
    noDemandMatchesDescription: "Yeni bir uygun ilan yayınlandığında uygulama içi ve cihaz bildirimi alacaksınız.",
    matchScore: "{count}% uyum",
    vehicleMarketplace: "Araç Pazarı",
    driverMarketplace: "Şoför Pazarı",
    shareVehicle: "Araç Paylaş",
    findVehicle: "Araç Bul",
    findAndShareVehicle: "Araç Bul - Paylaş",
    findDriver: "Şoför Bul",
    liveListings: "Canlı ilanlar",
    liveListingsDescription: "Yeni lojistik ilanları otomatik olarak burada görünür.",
    recentMatches: "Son eşleşmeler",
    recentMatchesDescription: "Aktif taleplerinizle eşleşen en güncel ilanlar.",
    demandNotifications: "Bu talep için bildirimler",
    demandNotificationsDescription: "Yeni bir ilan eşleştiğinde uygulama içi ve push bildirimi alın.",
    deleteDemand: "Talebi sil",
    deleteDemandConfirm: "Bu talebi ve eşleşme geçmişini kalıcı olarak silmek istiyor musunuz?",
    noLiveListings: "Henüz canlı ilan yok",
    noRecentMatches: "Henüz eşleşme yok",
    listingSource: "İlan Kaynağı: {source}",
    findVehicleDescription: "Boş araçları konum, rota ve araç tipine göre bulun.",
    shareVehicleDescription: "Boş aracınızı ve uygun olduğu rotayı yayınlayarak yük sahiplerine ulaşın.",
    findDriverDescription: "Uygun şoförleri veya güncel şoför iş ilanlarını bulun.",
    postDriverListing: "Şoför İlanı Ver",
    postDriverListingDescription: "Şoför aradığınızı veya çalışmaya uygun olduğunuzu güvenli biçimde yayınlayın.",
    vehicleRouteAvailability: "Konum ve uygunluk",
    vehicleCurrentLocation: "Aracın bulunduğu yer",
    vehiclePreferredDestinationOptional: "Tercih edilen varış (isteğe bağlı)",
    availableFrom: "Uygunluk başlangıcı",
    availableUntilOptional: "Uygunluk sonu (isteğe bağlı)",
    marketplaceDateRangeInvalid: "Uygunluk bitişi başlangıçtan önce olamaz.",
    vehicleCapacityFeatures: "Araç kapasitesi ve özellikleri",
    vehicleCapacityTonnesOptional: "Kapasite (ton, isteğe bağlı)",
    internationalTransport: "Uluslararası taşımaya uygun",
    internationalTransportDescription: "Araç uluslararası rotalarda çalışabilir.",
    adrSuitable: "ADR taşımaya uygun",
    adrSuitableDescription: "Araç tehlikeli madde taşımaya uygun donanıma sahiptir.",
    vehiclePriceOptional: "Talep edilen ücret (isteğe bağlı)",
    publishVehicle: "Aracı yayınla",
    vehiclePublishedTitle: "Araç ilanı yayınlandı",
    vehiclePublishedDescription: "Aracınız Araç Pazarı'nda yayına alındı.",
    vehicleCreateFailed: "Araç ilanı oluşturulamadı.",
    vehicleSearchFailed: "Araç ilanları alınamadı.",
    vehicleDetailFailed: "Araç ilanı detayları alınamadı.",
    vehicleUpdateFailed: "Araç ilanı güncellenemedi.",
    vehicleUpdated: "Araç ilanındaki değişiklikler kaydedildi.",
    availableVehicles: "Uygun araçlar",
    noVehiclesFound: "Uygun araç bulunamadı",
    noVehiclesFoundDescription: "Konum veya araç tipi filtrelerini değiştirerek yeniden arayın.",
    vehicleListing: "Araç ilanı",
    editVehicleListing: "Araç ilanını düzenle",
    editVehicleListingDescription: "Aracın rota, uygunluk ve iletişim bilgilerini güncelleyin.",
    toOptional: "Nereye (isteğe bağlı)",
    priceOnRequest: "Fiyat görüşülür",
    capacityFlexible: "Kapasite görüşülür",
    tonnesCount: "{count} ton",
    vehiclesCount: "{count} araç",
    contactByPhone: "Telefonla iletişime geç",
    contactUnavailable: "İletişim bilgisi şu anda kullanılamıyor.",
    description: "Açıklama",
    driverListingPurpose: "İlan amacı",
    driverWanted: "Şoför aranıyor",
    driverAvailable: "Şoför iş arıyor",
    driverWantedDescription: "Firmanız için aradığınız şoförün niteliklerini yayınlayın.",
    driverAvailableDescription: "Şoför olarak deneyiminizi ve çalışmak istediğiniz koşulları yayınlayın.",
    driverBasicInformation: "Temel bilgiler",
    driverListingTitle: "İlan başlığı",
    driverLocation: "Konum",
    preferredRouteOptional: "Tercih edilen rota (isteğe bağlı)",
    preferredRoute: "Tercih edilen rota",
    driverQualifications: "Ehliyet, deneyim ve belgeler",
    driverLicenseClasses: "Ehliyet sınıfları",
    driverLicenseClass: "Ehliyet sınıfı",
    allLicenseClasses: "Tüm ehliyet sınıfları",
    driverExperienceYears: "Deneyim (yıl)",
    yearsExperience: "{count} yıl deneyim",
    driverEmploymentType: "Çalışma biçimi",
    allEmploymentTypes: "Tüm çalışma biçimleri",
    driverEmploymentFULL_TIME: "Tam zamanlı",
    driverEmploymentPART_TIME: "Yarı zamanlı",
    driverEmploymentCONTRACT: "Sözleşmeli",
    driverEmploymentDAILY: "Günlük / seferlik",
    internationalExperience: "Uluslararası deneyim",
    driverSrcCertificate: "SRC belgesi",
    driverPsychotechnicalCertificate: "Psikoteknik belgesi",
    driverAdrCertificate: "ADR belgesi",
    driverSalaryOptional: "Ücret / maaş (isteğe bağlı)",
    salaryOnRequest: "Ücret görüşülür",
    driverTitleRequired: "En az 3 karakterlik bir ilan başlığı girin.",
    driverLocationRequired: "Geçerli bir konum girin.",
    driverLicenseRequired: "En az bir ehliyet sınıfı seçin.",
    driverExperienceInvalid: "Deneyim 0 ile 60 yıl arasında olmalıdır.",
    publishDriverListing: "Şoför ilanını yayınla",
    driverPublishedTitle: "Şoför ilanı yayınlandı",
    driverPublishedDescription: "İlanınız Şoför Pazarı'nda yayına alındı.",
    driverCreateFailed: "Şoför ilanı oluşturulamadı.",
    driverSearchFailed: "Şoför ilanları alınamadı.",
    driverDetailFailed: "Şoför ilanı detayları alınamadı.",
    driverUpdateFailed: "Şoför ilanı güncellenemedi.",
    driverUpdated: "Şoför ilanındaki değişiklikler kaydedildi.",
    driverListing: "Şoför ilanı",
    editDriverListing: "Şoför ilanını düzenle",
    editDriverListingDescription: "İlanın konum, nitelik ve iletişim bilgilerini güncelleyin.",
    availableDrivers: "Uygun şoförler",
    driverJobListings: "Şoför iş ilanları",
    noDriversFound: "Uygun şoför ilanı bulunamadı",
    noDriversFoundDescription: "Konum veya nitelik filtrelerini değiştirerek yeniden arayın.",
    myListingsUnifiedDescription: "Yük, araç ve şoför ilanlarınızı tek yerden düzenleyin ve durumlarını yönetin.",
    listingType: "İlan türü",
    status: "Durum",
    noListingsInThisSection: "Bu bölümde ilanınız yok",
    noListingsInThisSectionDescription: "Yeni ilan oluşturabilir veya farklı tür ve durum seçebilirsiniz.",
    saved: "Kaydedildi",
    ok: "Tamam",
    loading: "Yükleniyor",
    freightRouteSection: "Rota ve tarih",
    freightOrigin: "Yükleme noktası",
    freightDestination: "Teslimat noktası",
    freightLoadingDate: "Yükleme tarihi",
    freightLoadSection: "Yük ve araç bilgileri",
    freightWeightTonnes: "Ağırlık (ton)",
    freightTrailerType: "Dorse / araç tipi",
    freightSelectTrailer: "Dorse veya araç tipi seçin",
    freightVehicleCount: "Araç sayısı",
    freightCargoTypeOptional: "Yük türü (isteğe bağlı)",
    freightContainerStatus: "Konteyner durumu",
    freightCommercialSection: "Fiyat ve iletişim",
    freightPriceOptional: "Fiyat (isteğe bağlı)",
    freightCurrency: "Para birimi",
    freightCustomsOptional: "Gümrük bilgisi (isteğe bağlı)",
    freightContactPhone: "İletişim telefonu",
    freightDescriptionOptional: "Açıklama (isteğe bağlı)",
    publishLoad: "Yükü yayınla",
    freightOriginRequired: "Geçerli bir yükleme noktası girin.",
    freightDestinationRequired: "Geçerli bir teslimat noktası girin.",
    freightDateRequired: "Geçerli bir yükleme tarihi seçin.",
    freightDatePast: "Yükleme tarihi geçmiş bir gün olamaz.",
    freightWeightInvalid: "Ağırlık 0 ile 200 ton arasında olmalıdır.",
    freightTrailerRequired: "Dorse veya araç tipi seçin.",
    freightVehicleCountInvalid: "Araç sayısı 1 ile 100 arasında olmalıdır.",
    freightPriceInvalid: "Fiyat sıfırdan büyük olmalıdır.",
    freightCurrencyRequired: "Fiyat girildiğinde para birimi seçilmelidir.",
    freightPhoneRequired: "Geçerli bir iletişim telefonu girin.",
    freightTrailerCurtainsider: "Tenteli",
    freightTrailerOpen: "Açık dorse",
    freightTrailerClosed: "Kapalı dorse",
    freightTrailerRefrigerated: "Frigorifik",
    freightTrailerContainer: "Konteyner taşıyıcı",
    freightTrailerLowbed: "Lowbed",
    freightTrailerTruck: "Kamyon",
    freightTrailerVan: "Kamyonet",
    freightTrailerOther: "Diğer",
    freightContainerNone: "Konteyner yok",
    freightContainerOneWay: "Tek yön",
    freightContainerReturn: "İade gerekli",
    freightStatusActive: "Aktif",
    freightStatusCompleted: "Tamamlandı",
    freightStatusInactive: "Pasif",
    freightStatusExpired: "Süresi doldu",
    freightWeightValue: "{weight} ton",
    freightVehicleCountValue: "{count} araç",
    freightPriceNotSpecified: "Fiyat belirtilmedi",
    viewDetails: "Detayları gör",
    freightPublishedTitle: "Yük ilanı yayınlandı",
    freightPublishedDescription: "İlanınız Yük Pazarı'nda yayına alındı.",
    viewMyListings: "İlanlarımı gör",
    freightCreateFailed: "Yük ilanı oluşturulamadı.",
    from: "Nereden",
    to: "Nereye",
    freightAllTrailerTypes: "Tüm dorse ve araç tipleri",
    freightLoadingDateOptional: "Yükleme tarihi (isteğe bağlı)",
    freightAnyDate: "Tüm tarihler",
    clear: "Temizle",
    freightMinimumWeight: "En az ağırlık (ton)",
    freightMaximumWeight: "En fazla ağırlık (ton)",
    freightWeightRangeInvalid: "En düşük ağırlık, en yüksek ağırlıktan büyük olamaz.",
    freightAvailableLoads: "Uygun yükler",
    freightSearchFailed: "Yük ilanları alınamadı.",
    freightLoadingListings: "Yük ilanları hazırlanıyor",
    freightNoLoads: "Uygun yük bulunamadı",
    freightNoLoadsDescription: "Filtreleri değiştirerek yeniden arama yapabilirsiniz.",
    freightLoadDetails: "Yük ilanı detayları",
    freightLoadingDetails: "İlan detayları hazırlanıyor",
    back: "Geri dön",
    freightCargoType: "Yük türü",
    freightPrice: "Fiyat",
    freightCustoms: "Gümrük bilgisi",
    freightListingOwner: "İlan sahibi",
    freightPublishedAt: "Yayınlanma tarihi",
    notSpecified: "Belirtilmedi",
    freightDescription: "Açıklama",
    freightContactTitle: "İlan sahibiyle iletişim",
    freightContactConfirmation: "İlan sahibini {phone} numarasından şimdi aramak istiyor musunuz?",
    call: "Ara",
    contact: "İletişime geç",
    editListing: "İlanı düzenle",
    freightDetailsFailed: "İlan detayları alınamadı.",
    freightMyListingsFailed: "İlanlarınız alınamadı.",
    markCompleted: "Tamamlandı olarak işaretle",
    deactivate: "Pasife al",
    reactivate: "Yeniden etkinleştir",
    freightStatusConfirmation: "Bu ilanın durumunu değiştirmek istediğinizden emin misiniz?",
    freightStatusUpdateFailed: "İlan durumu güncellenemedi.",
    freightNotEditable: "Tamamlanmış bir ilan düzenlenemez.",
    freightStatusTransitionInvalid: "Bu ilan için seçilen durum değişikliği yapılamaz.",
    freightNoMyListings: "Bu durumda ilanınız yok",
    freightNoMyListingsDescription: "Yeni bir yük ilanı oluşturabilir veya diğer durumları görüntüleyebilirsiniz.",
    freightUpdatedTitle: "İlan güncellendi",
    freightUpdatedDescription: "Yük ilanındaki değişiklikler kaydedildi.",
    freightUpdateFailed: "Yük ilanı güncellenemedi.",
    editListingDescription: "Yük ilanınızın taşıma ve iletişim bilgilerini güncelleyin.",
    profile: "Profil",
    placeholder: "Bu ekran mobil iş mantığı için hazırlandı.",
    connectedAccounts: "Bağlı WhatsApp Hesapları",
    sentThisMonth: "Bu Ay Gönderilen",
    failedMessages: "Başarısız Mesajlar",
    currentPlan: "Geçerli Paket",
    remainingDays: "Kalan gün",
    activePlan: "Aktif Paket",
    trialPlan: "Deneme Paketi",
    expiredPlan: "Paket süresi doldu",
    suspendedPlan: "Paket askıya alındı",
    cancelledPlan: "Paket iptal edildi",
    retry: "Tekrar dene",
    refresh: "Yenile",
    manageWhatsAppAccounts: "WhatsApp hesaplarını yönet",
    noWhatsAppAccountFound: "WhatsApp hesabı bulunamadı",
    connectAccount: "Hesap bağla",
    addWhatsAppAccount: "WhatsApp hesabı ekle",
    connectWithQr: "QR ile bağlan",
    connectWithPhoneCode: "Telefon koduyla bağlan",
    connect: "Bağlan",
    reconnect: "Yeniden bağlan",
    archive: "Arşivle",
    delete: "Sil",
    cancel: "Vazgeç",
    confirm: "Onayla",
    edit: "Düzenle",
    statusConnected: "Bağlı",
    statusNotConnected: "Bağlantı kesildi",
    statusConnecting: "Bağlanıyor",
    statusWaitingQr: "QR Bekleniyor",
    statusWaitingPhone: "Telefon Kodu Bekleniyor",
    statusFailed: "Bağlantı kesildi",
    statusDisconnected: "Bağlantı kesildi",
    statusReconnectRequired: "Yeniden bağlan",
    statusArchived: "Arşivlendi",
    whatsappMessageChecking: "Bağlantı kontrol ediliyor",
    whatsappMessageReconnecting: "Yeniden bağlantı deneniyor",
    whatsappMessageConnectionFailed: "WhatsApp bağlantısı geçici olarak kesildi",
    whatsappMessageReconnect: "Yeniden bağlanmayı deneyin",
    whatsappMessageAuthRequired: "WhatsApp hesabınızı yeniden bağlamanız gerekiyor",
    whatsappMessageLoggedOut: "WhatsApp oturumu kapatıldı",
    loadingDashboard: "Kontrol paneli hazırlanıyor",
    loadingWhatsApp: "WhatsApp hesapları yükleniyor",
    emptyDashboard: "Henüz gösterilecek veri yok.",
    accountActionsPrepared: "QR veya telefon kodu ile WhatsApp hesabınızı güvenli şekilde bağlayın.",
    lastSync: "Son eşitleme",
    contacts: "Kişiler",
    phone: "Telefon",
    connectedGroups: "Bağlı grup",
    connectionState: "Bağlantı durumu",
    unknown: "Bilinmiyor",
    generateQr: "QR kod oluştur",
    refreshQr: "QR kodu yenile",
    qrInstructions: "WhatsApp uygulamasında Bağlı Cihazlar > Cihaz Bağla menüsünden QR kodu okutun.",
    qrGenerating: "QR kod oluşturuluyor",
    qrWaiting: "QR taraması bekleniyor",
    qrExpired: "QR kodun süresi doldu. Yeni QR kod otomatik alınacak.",
    connectionSuccess: "Bağlantı başarılı",
    returningToAccounts: "Hesap listesine dönülüyor",
    country: "Ülke",
    countryTurkey: "Türkiye",
    selectCountry: "Ülke seç",
    searchCountry: "Ülke ara",
    searchCountryPlaceholder: "Ülke adı, kodu veya ISO ara",
    internationalPhoneInvalid: "Seçilen ülkeye uygun geçerli bir telefon numarası girin.",
    phoneCountryUnsupported: "Bu ülke telefon koduyla eşleştirme henüz desteklenmiyor.",
    phoneCountryCodeDuplicate: "Ülke kodunu telefon alanına tekrar yazmayın.",
    starterAttributionNotice: "Reklamlı paketlerde gönderilen mesajlara LOGIVYA bilgisi otomatik olarak eklenir.",
    starterAttributionLengthExceeded: "Plan imzası için ayrılan alan nedeniyle mesaj en fazla {max} karakter olabilir.",
    billingMonthly: "Aylık",
    billingYearly: "Yıllık",
    pricePerMonth: "Aylık",
    pricePerYear: "Yıllık",
    monthlyEquivalent: "Aylık karşılığı {price}",
    trialSevenDays: "7 gün ücretsiz",
    freeBadge: "Ücretsiz",
    planTrialName: "Logivya 7 Gün Ücretsiz",
    planStarterName: "Logivya Plus",
    planProfessionalName: "Logivya Pro",
    planStarterDescription: "Lojistik ilanları, mesajlaşma, kişi ve grup yönetimi için güçlü başlangıç planı.",
    planProfessionalDescription: "Yoğun lojistik operasyonları, gelişmiş mesajlaşma ve reklamsız kullanım için profesyonel plan.",
    planFeaturesLabel: "Paket özellikleri",
    planFeatureAccounts: "{count} Hesap",
    planFeatureBranded: "Reklamlı gönderim",
    planFeatureUnbranded: "Reklamsız gönderim",
    planFeatureContacts: "Kişilerinize mesaj gönderimi",
    planFeatureGroups: "Gruplarınıza mesaj gönderimi",
    planFeatureScheduledRecurring: "Zamanlı ve tekrarlı mesaj",
    planFeatureDeleteEveryone: "Herkesten silme",
    planFeatureAdvancedSupport: "Gelişmiş destek",
    planFeatureTrialDays: "{count} gün ücretsiz deneme",
    chooseStarter: "LOGIVYA Plus seç",
    chooseProfessional: "LOGIVYA Pro seç",
    countryCode: "Ülke kodu",
    phoneNumber: "Telefon numarası",
    phonePlaceholder: "Telefon numaranızı girin",
    generatePhoneCode: "Telefon kodu oluştur",
    newCode: "Yeni kod al",
    pairingCode: "Bağlantı kodu",
    phoneCodeInstructions: "WhatsApp > Bağlı Cihazlar > Telefon numarasıyla bağla ekranına bu kodu girin.",
    normalizedPhone: "Normalize telefon",
    pollingConnection: "Bağlantı kontrol ediliyor",
    actionFailed: "İşlem tamamlanamadı.",
    deleteConfirmation: "Bu WhatsApp hesabını silmek istediğinizden emin misiniz?",
    archiveConfirmation: "Bu WhatsApp hesabını arşivlemek istediğinizden emin misiniz?",
    reconnectConfirmation: "Bu WhatsApp hesabı için yeniden bağlantı başlatılsın mı?",
    loadingGroups: "Gruplar yükleniyor",
    groupsEyebrow: "WhatsApp Grupları",
    groupsTitle: "Grupları yönet",
    groupsSubtitle: "Bağlı WhatsApp hesaplarından gelen grupları arayın, filtreleyin ve kategori durumlarını izleyin.",
    searchGroups: "Grup ara",
    searchGroupsPlaceholder: "Grup adı yazın...",
    filterByAccount: "Hesaba göre filtrele",
    filterByCategory: "Kategoriye göre filtrele",
    allAccounts: "Tüm hesaplar",
    allCategories: "Tüm kategoriler",
    clearFilters: "Filtreleri temizle",
    noGroupsFound: "Grup bulunamadı",
    noGroupsFoundDescription: "Aramanızı veya filtrelerinizi değiştirerek tekrar deneyin.",
    sendable: "Gönderilebilir",
    notSendable: "Gönderilemez",
    members: "Üye",
    loadingCategories: "Kategoriler yükleniyor",
    categoriesEyebrow: "Kategori Yönetimi",
    categoriesTitle: "Kategoriler",
    categoriesSubtitle: "Mesaj hedeflerini düzenlemek için kategori oluşturun, düzenleyin ve grupları atayın.",
    createCategory: "Kategori oluştur",
    editCategory: "Kategoriyi düzenle",
    deleteCategory: "Kategoriyi sil",
    deleteCategoryConfirmation: "Bu kategoriyi silmek istediğinizden emin misiniz?",
    categoryName: "Kategori adı",
    categoryDescription: "Açıklama",
    categoryColor: "Renk seç",
    changeCategoryColor: "Rengi değiştir",
    selectedCategoryColor: "Seçili renk",
    categoryColorOptions: "Hazır renkler",
    categoryNameValidation: "Kategori adı en az 2 karakter olmalıdır.",
    categoryColorValidation: "Renk #f97316 formatında olmalıdır.",
    saveChanges: "Değişiklikleri kaydet",
    noCategoriesFound: "Kategori bulunamadı",
    noCategoriesFoundDescription: "İlk kategorinizi oluşturarak grupları düzenlemeye başlayın.",
    assignedGroups: "Atanmış grup",
    categoryDetail: "Kategori detayı",
    categoryNotFound: "Kategori bulunamadı",
    noAssignedGroups: "Atanmış grup yok",
    noAssignedGroupsDescription: "Aşağıdaki listeden bu kategoriye grup ekleyebilirsiniz.",
    assignGroups: "Grupları ata",
    saveAssignments: "Atamaları kaydet",
    loadingSupport: "Destek talepleri yükleniyor",
    supportCenter: "Destek Merkezi",
    supportTickets: "Destek Talepleri",
    supportSubtitle: "Sorunlarınızı ekibimize iletin, mevcut taleplerinizi ve konuşmaları takip edin.",
    createTicket: "Destek talebi oluştur",
    ticketDetail: "Talep detayı",
    noTicketsFound: "Destek talebi yok",
    noTicketsFoundDescription: "Yeni bir talep oluşturarak Logivya ekibinden destek alabilirsiniz.",
    supportOpen: "Açık",
    supportPending: "Beklemede",
    supportInProgress: "İşlemde",
    supportAnswered: "Yanıtlandı",
    supportResolved: "Çözüldü",
    supportClosed: "Kapalı",
    createTicketSubtitle: "Konu, kategori ve açıklama girerek destek talebinizi açın.",
    ticketSubject: "Konu",
    ticketCategory: "Kategori",
    ticketDescription: "Açıklama",
    supportValidation: "Konu en az 3, açıklama en az 5 karakter olmalıdır.",
    ticketTechnical: "Teknik",
    ticketBilling: "Faturalama",
    ticketSubscription: "Abonelik",
    ticketWhatsapp: "WhatsApp",
    search: "Ara",
    all: "Tümü",
    priority: "Öncelik",
    internalNote: "İç not",
    updatePriority: "Önceliği güncelle",
    supportWaitingForUser: "Kullanıcı yanıtı bekleniyor",
    supportWaitingForAdmin: "Destek yanıtı bekleniyor",
    ticketMessageDelivery: "Mesaj iletimi",
    ticketDeleteForEveryone: "Herkesten silme",
    ticketAccount: "Hesap",
    ticketTeam: "Ekip",
    ticketSecurity: "Güvenlik",
    ticketFeatureRequest: "Özellik talebi",
    unreadReplies: "Okunmamış yanıt",
    loadMore: "Daha fazla yükle",
    loadOlderMessages: "Eski mesajları yükle",
    ticketNumber: "Talep numarası",
    ticketOther: "Diğer",
    reply: "Yanıt",
    sendReply: "Yanıt gönder",
    logout: "Çıkış yap",
    logoutCompleted: "Oturum kapatıldı.",
    unknownUser: "Logivya Kullanıcısı",
    phoneNotSet: "Telefon eklenmemiş",
    unknownRole: "Rol bilinmiyor",
    company: "Çalışma alanı",
    companySettings: "Profil Bilgileri",
    companySettingsDescription: "Profil ve iletişim bilgilerinizi yönetin.",
    subscription: "Abonelik",
    subscriptionDescription: "Paket, deneme süresi ve abonelik durumunu görüntüleyin.",
    notifications: "Bildirimler",
    notificationsDescription: "Destek, abonelik, WhatsApp ve kampanya bildirimlerini takip edin.",
    notificationPreferences: "Bildirim tercihleri",
    notificationPreferencesDescription: "Her bildirim kategorisi için kullanmak istediğiniz kanalları yönetin.",
    notificationPreferencesSaved: "Bildirim tercihleriniz kaydedildi.",
    notificationPreferencesSaveFailed: "Bildirim tercihleri kaydedilemedi.",
    notificationChannelInApp: "Uygulama içi",
    notificationChannelEmail: "E-posta",
    notificationChannelAndroid: "Android bildirimi",
    notificationChannelIos: "iOS bildirimi",
    notificationChannelWeb: "Web bildirimi",
    notificationMandatory: "Zorunlu bildirim",
    notificationCategoryAccount: "Hesap",
    notificationCategorySecurity: "Güvenlik",
    notificationCategorySupport: "Destek",
    notificationCategorySubscription: "Abonelik",
    notificationCategoryBilling: "Faturalandırma",
    notificationCategoryInvitation: "Davetler",
    notificationCategoryWhatsapp: "WhatsApp",
    notificationCategoryMessage: "Mesajlar",
    notificationCategoryMarketplace: "Lojistik pazarı",
    notificationCategorySystem: "Sistem",
    notificationCategoryMarketing: "Pazarlama",
    notificationCategoryCompliance: "Uyumluluk",
    notificationCategoryAdministration: "Yönetim",
    notificationCategoryBackup: "Yedekleme",
    notificationCategoryIncident: "Olaylar",
    savePreferences: "Tercihleri kaydet",
    notificationDeliveryMode: "Teslimat biçimi",
    notificationImmediate: "Anında",
    notificationDailyDigest: "Günlük",
    notificationWeeklyDigest: "Haftalık",
    notificationQuietStart: "Sessiz saat başlangıcı",
    notificationQuietEnd: "Sessiz saat bitişi",
    notificationPermissionTitle: "Android bildirim izni",
    notificationPermissionDescription: "Bildirim iznini ve cihaz kaydını yönetin.",
    notificationPermissionEducation: "WhatsApp bağlantısı, destek yanıtları, güvenlik olayları ve abonelik değişikliklerini zamanında almak için Android bildirimlerine izin verin.",
    notificationPermissionEnable: "Bildirimleri etkinleştir",
    notificationPermissionEnabled: "Bildirimler etkin",
    notificationPermissionDisabled: "Bildirimler kapalı",
    notificationPermissionDenied: "Bildirim izni verilmedi. İzni Android ayarlarından açabilirsiniz.",
    loadingNotifications: "Bildirimler yükleniyor",
    loadingMessageHistory: "Mesaj geçmişi yükleniyor",
    notificationsLoadFailed: "Bildirimler alınamadı",
    noNotificationsDescriptionReady: "Destek, abonelik, WhatsApp ve kampanya bildirimleri burada görünecek.",
    feedback: "Geri bildirim",
    feedbackMenuDescription: "Hata bildirin, özellik önerin ve deneyiminizi doğrudan ekibimizle paylaşın.",
    closedBeta: "Bize yardımcı olun",
    feedbackTitle: "Logivya geri bildirimi",
    feedbackDescription: "Karşılaştığınız hataları ve geliştirme önerilerinizi doğrudan Logivya ekibine iletin.",
    reportBug: "Hata bildir",
    suggestFeature: "Özellik öner",
    feedbackSubject: "Konu",
    feedbackSubjectPlaceholder: "Kısa başlık yazın",
    feedbackMessage: "Açıklama",
    feedbackMessagePlaceholder: "Ne oldu, hangi ekranda oldu, nasıl tekrar edilir?",
    screenshotUrl: "Ekran görüntüsü bağlantısı",
    deviceInformation: "Cihaz bilgisi",
    appVersion: "Uygulama sürümü",
    sendFeedback: "Geri bildirim gönder",
    feedbackValidation: "Konu en az 3, açıklama en az 10 karakter olmalıdır.",
    feedbackSent: "Geri bildirim alındı",
    feedbackSentDescription: "Teşekkürler. Logivya ekibi bildiriminizi inceleyecek.",
    feedbackFailed: "Geri bildirim gönderilemedi",
    releaseChannel: "Yayın kanalı",
    settings: "Ayarlar",
    settingsDescription: "Dil, tema, güvenlik ve oturum ayarlarınızı yönetin.",
    onboardingEyebrow: "Başlangıç rehberi",
    onboardingTitle: "Logivya'yı birkaç adımda keşfedin",
    onboardingSubtitle: "WhatsApp hesaplarınızı bağlayın, gruplarınızı düzenleyin ve iletişim akışınızı güvenle yönetin.",
    onboardingControlTitle: "Kontrol sizde",
    onboardingControlDescription: "Bildirimlerinizi kişiselleştirin, hesabınızı koruyun ve geri bildiriminizi uygulamadan gönderin.",
    onboardingSkip: "Atla",
    onboardingStart: "Logivya'yı kullanmaya başla",
    onboardingReplay: "Başlangıç rehberi",
    onboardingReplayDescription: "Temel özellikleri anlatan kısa rehberi yeniden görüntüleyin.",
    profileEditing: "Profil düzenleme",
    profileEditingApiMissing: "Profil güncelleme ve parola değiştirme mobil API'si henüz backend'de yok. Bu ekran mevcut hesap verisini güvenli şekilde gösterir.",
    companyName: "Ad Soyad",
    companyPhone: "Telefon",
    companyAddress: "Adres",
    taxOffice: "Vergi Dairesi",
    taxNumber: "Vergi Numarası",
    city: "Şehir",
    district: "İlçe",
    postalCode: "Posta Kodu",
    address: "Adres",
    save: "Kaydet",
    saving: "Kaydediliyor",
    savedSuccessfully: "Profil bilgileri kaydedildi.",
    saveFailed: "Profil bilgileri kaydedilemedi. Lütfen tekrar deneyin.",
    requiredField: "Zorunlu alanları doldurun.",
    invalidEmail: "Geçerli bir e-posta adresi girin.",
    loadingCompanyProfile: "Profil bilgileri yükleniyor",
    companyProfileLoadFailed: "Profil bilgileri alınamadı. Lütfen tekrar deneyin.",
    companyNamePlaceholder: "Ad soyad girin",
    companyEmailPlaceholder: "E-posta adresi girin",
    companyPhonePlaceholder: "Telefon numarası girin",
    companyAddressPlaceholder: "Adres girin",
    taxOfficePlaceholder: "Vergi dairesi girin",
    taxNumberPlaceholder: "Vergi numarası girin",
    cityPlaceholder: "Şehir girin",
    districtPlaceholder: "İlçe girin",
    countryPlaceholder: "Ülke girin",
    postalCodePlaceholder: "Posta kodu girin",
    notProvided: "Belirtilmemiş",
    loadingSubscription: "Abonelik bilgisi yükleniyor",
    startDate: "Başlangıç tarihi",
    endDate: "Bitiş tarihi",
    upgradePlan: "Planı yükselt",
    subscriptionTrial: "Deneme",
    subscriptionActive: "Aktif",
    subscriptionExpired: "Süresi doldu",
    subscriptionSuspended: "Askıya alındı",
    subscriptionCancelled: "İptal edildi",
    unreadNotifications: "Okunmamış bildirim",
    markAllAsRead: "Tümünü okundu işaretle",
    noNotifications: "Bildirim yok",
    noNotificationsDescription: "Bildirim listeleme API'si eklendiğinde destek, abonelik, WhatsApp ve kampanya bildirimleri burada görünecek.",
    language: "Dil",
    theme: "Tema",
    lightTheme: "Açık",
    darkTheme: "Koyu",
    systemTheme: "Sistem",
    biometricReady: "Biyometrik girişe hazır",
    about: "Hakkında",
    accountSection: "Hesap",
    deleteAccount: "Hesabı sil",
    deleteAccountDescription: "Hesap kapatma ve veri silme talebi oluşturun.",
    privacyData: "Gizlilik ve veriler",
    privacyDataDescription: "Gizlilik tercihlerinizi ve veri taleplerinizi yönetin.",
    privacyControls: "Gizlilik kontrolleri",
    privacyPreferences: "İsteğe bağlı veri kullanımı",
    privacyPreferencesDescription: "Zorunlu hizmet işlemleri kapatılamaz. İsteğe bağlı kullanımları dilediğiniz zaman değiştirebilirsiniz.",
    privacyAnalytics: "Ürün analitiği",
    privacyAnalyticsDescription: "Ürünü geliştirmek için isteğe bağlı kullanım ölçümlerini paylaşın.",
    privacyDiagnostics: "Tanılama verileri",
    privacyDiagnosticsDescription: "Çökme, açılış, ağ ve ekran performansı verilerini teknik sorunları çözmemize yardımcı olmak için isteğe bağlı paylaşın.",
    privacyMarketing: "Pazarlama iletişimi",
    privacyMarketingDescription: "İsteğe bağlı kampanya ve ürün duyurularını alın.",
    privacyPreferenceFailed: "Gizlilik tercihi kaydedilemedi.",
    privacyExportTitle: "Verilerimi dışa aktar",
    privacyExportDescription: "Hesabınıza ait uygun verilerin şifreli bir kopyasını hazırlayın.",
    privacyRequestExport: "Dışa aktarma talebi oluştur",
    privacyExportQueued: "Şifreli dışa aktarma hazırlanmak üzere sıraya alındı.",
    privacyExportFailed: "Dışa aktarma işlemi tamamlanamadı.",
    privacyExportTokenMissing: "Bu dışa aktarma için tek kullanımlık indirme anahtarı bu cihazda bulunamadı.",
    privacyRightsRequest: "Veri hakları talebi",
    privacyRequestACCESS: "Erişim",
    privacyRequestRECTIFICATION: "Düzeltme",
    privacyRequestRESTRICTION: "İşlemeyi kısıtlama",
    privacyRequestOBJECTION: "İtiraz",
    privacyRequestOTHER: "Diğer",
    privacyRequestDescription: "Talebinizi ve doğrulanması gereken ayrıntıları açıklayın.",
    privacySubmitRequest: "Talebi gönder",
    privacyRequestReceived: "Veri talebiniz alındı.",
    privacyRequestFailed: "Veri talebi gönderilemedi.",
    privacyRequestHistory: "Talep geçmişi",
    currentPassword: "Mevcut parola",
    download: "İndir",
    accountDeletionPhrase: "LOGIVYA HESABIMI SİL",
    companyDeletionPhrase: "LOGIVYA ÇALIŞMA ALANIMI SİL",
    userAccountScope: "Yalnızca kullanıcı hesabım",
    companyAccountScope: "Çalışma alanı ve ilişkili veriler",
    deletionQueuedDescription: "Silme talebiniz doğrulama ve saklama kontrolleri için sıraya alındı.",
    deletionCanceledDescription: "Silme talebi iptal edildi.",
    submitDeletionRequest: "Silme talebi oluştur",
    cancelRequest: "Talebi iptal et",
    appTagline: "İlanını Yayınla. Uygun Fırsatı Bul. Lojistiği Logivya ile Yönet.",
    close: "Kapat",
    openMenu: "Menüyü aç",
    closeMenu: "Menüyü kapat",
    toggleTheme: "Temayı değiştir",
    changeLanguage: "Dili değiştir",
    continue: "Devam et",
    operationFailed: "İşlem tamamlanamadı",
    tryAgain: "Lütfen tekrar deneyin.",
    appRestartRequired: "Logivya yeniden başlatılmalı",
    unexpectedError: "Beklenmeyen bir hata oluştu. Tekrar deneyebilirsiniz.",
    appPreparing: "Logivya hazırlanıyor...",
    audienceLoadFailed: "Kitle listesi yüklenemedi.",
    contactsLoadFailed: "Kişiler yüklenemedi.",
    contactsRefreshFailed: "Kişiler yenilenemedi.",
    selectedGroupsAndContacts: "Seçili gruplar ve kişiler",
    selectedGroupsOnly: "Seçili gruplar",
    selectedContactsOnly: "Seçili kişiler",
    noTargetSelected: "Hedef seçilmedi",
    targetSummary: "{count} hedef ({groups} grup, {contacts} kişi)",
    targetPrompt: "Kategori, grup veya kişi seçin",
    messageRequired: "Mesaj metni boş olamaz.",
    audienceRequired: "En az bir kategori, grup veya kişi seçin.",
    scheduleRequired: "Lütfen tarih ve saat seçin.",
    schedulePast: "Seçilen tarih ve saat geçmişte olamaz.",
    actionSuccess: "İşlem başarılı",
    messageScheduled: "Mesaj zamanlandı: {count} hedef",
    messageQueued: "Mesaj gönderim kuyruğuna alındı: {count} hedef",
    messageSendFailed: "Mesaj gönderilemedi.",
    loadingAudiences: "Kitle listesi yükleniyor",
    campaignStudio: "Kampanya Stüdyosu",
    messagingTitle: "Mesaj Gönder",
    messagingSubtitle: "Kategori, grup ve izinli kişileri seçin; mesajı güvenli gönderim kuyruğuna alın.",
    selectedTarget: "Seçili hedef",
    sendableGroup: "Gönderilebilir grup",
    selectedContact: "Seçili kişi",
    writeMessage: "Mesaj yazın",
    messagePlaceholder: "Mesajınızı veya ek açıklamasını yazın...",
    addAttachment: "Dosya ekle",
    photo: "Fotoğraf",
    video: "Video",
    document: "Belge",
    removeAttachment: "Eki kaldır",
    attachmentHelp: "Fotoğraf, video veya belge ekleyebilir; yazdığınız metni aynı gönderide açıklama olarak gönderebilirsiniz.",
    attachmentTooLarge: "Dosya platform sınırını aşıyor.",
    photoAttachmentTooLarge: "Fotoğraf platform sınırını aşıyor.",
    whatsAppAttachmentHelp: "Aynı gönderime karışık olarak en fazla 30 fotoğraf, video ve belge ekleyebilirsiniz. Her dosya en fazla 100 MB.",
    telegramAttachmentHelp: "Aynı gönderime karışık olarak en fazla 30 fotoğraf, video ve belge ekleyebilirsiniz. Her dosya en fazla 2 GB.",
    whatsAppAttachmentTooLarge: "WhatsApp için her dosya en fazla 100 MB olabilir.",
    telegramAttachmentTooLarge: "Telegram için her dosya en fazla 2 GB olabilir.",
    attachmentCountTooLarge: "Tek gönderimde en fazla {{max}} dosya seçebilirsiniz.",
    selectedAttachmentCount: "{{count}} dosya seçildi",
    removeAllAttachments: "Tümünü kaldır",
    attachmentPickFailed: "Dosya seçilemedi.",
    attachmentUploadFailed: "Dosya yüklenemedi.",
    attachmentUploadCanceled: "Dosya yükleme iptal edildi.",
    attachmentUploading: "Yükleniyor: {{completed}}/{{total}}",
    cancelAttachmentUpload: "Yüklemeyi iptal et",
    retryAttachmentUpload: "Yüklemeyi tekrar dene",
    sendNow: "Şimdi gönder",
    scheduleAction: "Zamanla",
    repeatAction: "Tekrarla",
    selectDateTime: "Tarih ve saat seçin",
    select: "Seç",
    daily: "Günlük",
    weekly: "Haftalık",
    monthly: "Aylık",
    intervalPlaceholder: "Aralık: 1",
    targetLabel: "Hedef: {value}",
    contentLabel: "İçerik: {value}",
    scheduleMessage: "Mesajı Zamanla",
    createRecurringDelivery: "Tekrarlayan gönderim oluştur",
    sendMessage: "Mesajı gönder",
    selectAudiences: "Kitleleri seç",
    searchAudience: "Kategori veya grup ara...",
    noCategories: "Henüz kategori yok.",
    selectVisible: "Görünenleri seç",
    peopleCount: "{count} kişi",
    noSendableGroups: "Gönderilebilir grup yok",
    groupsResyncing: "Bağlantı sağlıklı görünüyor; grup listesi yeniden eşitleniyor.",
    connectOrSyncGroups: "WhatsApp hesabınızı bağlayın veya grupları eşitleyin.",
    refreshContacts: "Kişileri yenile",
    professionalContactsRequired: "Kişilere mesaj göndermek için aktif bir abonelik gerekir.",
    searchContacts: "Kişi ara",
    selectAllContacts: "Tüm kişileri seç",
    selectingAllContacts: "Tüm kişiler seçiliyor...",
    selectVisibleContacts: "Görünen kişileri seç",
    selectedCount: "{count} seçili",
    contactsLoading: "Kişiler yükleniyor...",
    noContactsInAccount: "Bu WhatsApp hesabında kişi bulunamadı",
    noContactsInAccountDescription: "Kişileri yenileyin veya bağlı WhatsApp hesabındaki rehber eşitlemesini kontrol edin.",
    loadMoreContacts: "Daha fazla kişi yükle",
    messagingCompliance: "Yalnızca mesaj bekleyen veya iletişim izni bulunan alıcılara gönderim yapın.",
    noAssignedAudience: "Henüz hedef atanmadı",
    recurringIntervalValidation: "Tekrar aralığı 1 ile 365 arasında olmalıdır.",
    reporting: "Raporlama",
    messageHistoryTitle: "Mesaj Geçmişi",
    messageHistorySubtitle: "Gönderilen, zamanlanan ve tamamlanan kampanyaları takip edin.",
    sent: "Gönderilen",
    scheduled: "Zamanlı",
    failed: "Başarısız",
    noCampaigns: "Henüz kampanya yok",
    noCampaignsDescription: "Mesaj gönderdikten veya zamanladıktan sonra kayıtlar burada görünür.",
    deleteForMe: "Benden sil",
    deleteForMeDescription: "Bu kayıt yalnızca sizin mesaj geçmişinizden kaldırılacak.",
    deleteForEveryone: "Herkesten sil",
    deleteForEveryoneDescription: "WhatsApp gruplarına giden mesajlar desteklenen süre içindeyse herkesten silinmeye çalışılacak.",
    deleteFromPlatform: "Platformdan sil",
    deleteFromPlatformDescription: "Bu kampanya Logivya geçmişinden kaldırılacak. WhatsApp gruplarındaki mesajları silmez.",
    mobileCampaign: "Mobil kampanya",
    scheduledAt: "Zamanlı: {date}",
    completedAt: "Tamamlandı: {date}",
    noDate: "Tarih yok",
    targetsMetric: "Hedef: {count}",
    sentMetric: "Giden: {count}",
    errorMetric: "Hata: {count}",
    groupMetric: "Grup: {count}",
    contactMetric: "Kişi: {count}",
    pendingMetric: "Bekleyen: {count}",
    retryingMetric: "Tekrar: {count}",
    deleteEveryoneAvailable: "Herkesten silme kullanılabilir.",
    deleteEveryoneExpired: "Herkesten silme süresi doldu.",
    deleteEveryoneProgress: "Herkesten silme: {deleted}/{total} silindi, {pending} bekliyor, {failed} hata.",
    statusCompleted: "Tamamlandı",
    statusPartiallyCompleted: "Kısmen tamamlandı",
    messageSendPacing: "İki kampanya arka arkaya başlar. Sonraki ikili en az 5 dakika bekler. Gruplar arasında en az 6 saniye bırakılır.",
    statusQueued: "Sırada",
    statusSending: "Gönderiliyor",
    statusFailedMessage: "Başarısız",
    statusCancelled: "İptal",
    teamAccess: "Ekip erişimi",
    teamUsersSubtitle: "Kullanıcıları davet edin, rollerini ve erişim durumlarını yönetin.",
    newUserInvite: "Yeni Kullanıcı Davet Et",
    nameEmailRequired: "Ad soyad ve e-posta zorunludur.",
    copiedToClipboard: "{label} panoya kopyalandı.",
    copyFailed: "{label} kopyalanamadı.",
    companyUsers: "Kullanıcılar",
    memberStatus: "Durum",
    seatsCount: "{used}/{limit} hesap",
    activeCount: "{active}/{total} aktif",
    total: "Toplam",
    totalUsers: "Toplam kullanıcı",
    active: "Aktif",
    invited: "Davetli",
    fullName: "Ad Soyadı",
    role: "Rol",
    whatsappSendPaused: "Bu gönderimde WhatsApp hız sınırı bildirildi. En az 5 dakika ara verilir. Başarısız hedeflerin teslim durumunu kontrol edin.",
    whatsappSendSafetyUnavailable: "Gönderim güvenlik kontrolüne ulaşılamadığı için bu gönderimler yapılmadı. Bağlantı düzeldiğinde başarısız hedefleri yeniden deneyin.",
    roleOwner: "Sahip",
    roleAdmin: "Yönetici",
    roleOperator: "Operatör",
    roleViewer: "Görüntüleyici",
    memberStatusActive: "Aktif",
    memberStatusInvited: "Davetli",
    memberStatusSuspended: "Askıda",
    memberStatusRemoved: "Kaldırıldı",
    userType: "Kullanıcı tipi",
    standardUser: "Standart Kullanıcı",
    inviteUser: "Kullanıcı Davet Et",
    invitationReady: "Davet hazır",
    invitationOneTimeNotice: "Davet, tek kullanımlık güvenli bağlantıyla e-posta adresine gönderilir.",
    invitationDeliveryNotice: "Davet, tek kullanımlık güvenli bağlantıyla e-posta adresine gönderilir.",
    invitationCode: "Davet kodu",
    invitationLink: "Davet bağlantısı",
    emailSent: "Gönderildi",
    emailNotSent: "E-posta gönderimi sıraya alındı; otomatik olarak yeniden denenecek.",
    emailDelivery: "E-posta: {status}",
    pendingInvitations: "Bekleyen davetler",
    invitedAt: "Davet tarihi: {date}",
    expiresAt: "Son tarih: {date}",
    usersLoading: "Kullanıcılar yükleniyor...",
    userInviteCreated: "Davet başarıyla gönderildi.",
    userInviteQueued: "Davet oluşturuldu. E-posta gönderimi sıraya alındı.",
    trialUserInviteUpgrade: "Kullanıcı davet etmek için Logivya Plus veya Logivya Pro planına geçin.",
    invitationFailed: "Davet gönderilemedi.",
    resendInvitation: "Daveti yeniden gönder",
    invitationResent: "Davet bağlantısı yenilendi ve yeniden gönderildi.",
    userUpdated: "Kullanıcı güncellendi.",
    userUpdateFailed: "Kullanıcı güncellenemedi.",
    removeUser: "Kullanıcıyı kaldır",
    removeUserConfirm: "{email} çalışma alanı erişiminden kaldırılsın mı?",
    remove: "Kaldır",
    userAccessRemoved: "Kullanıcı erişimi kaldırıldı.",
    userRemoveFailed: "Kullanıcı kaldırılamadı.",
    revokeInvitation: "Daveti iptal et",
    revokeInvitationConfirm: "{email} daveti iptal edilsin mi?",
    invitationRevoked: "Davet iptal edildi.",
    invitationRevokeFailed: "Davet iptal edilemedi.",
    copyValue: "{label} kopyala",
    noLastLogin: "Son giriş yok",
    lastLoginAt: "Son giriş: {date}",
    assignedGroupsTitle: "Atanmış gruplar",
    assignableGroups: "Atanabilir gruplar",
    noAssignableGroups: "Henüz atanabilir WhatsApp grubu yok.",
    noAssignableGroupsDescription: "Önce WhatsApp hesabınızı bağlayın ve grupları eşitleyin.",
    allGroupsAssigned: "Atanabilecek ek grup yok.",
    allGroupsAssignedDescription: "Bu kategori için tüm WhatsApp grupları seçilmiş.",
    contactsSelected: "{count} kişi seçildi",
    contactCategoryProfessionalRequired: "Kişileri kategorilere eklemek için aktif bir abonelik gerekir.",
    assignedContacts: "Atanmış kişiler",
    noAssignedContactsInView: "Bu görünümde atanmış kişi yok.",
    assignableContacts: "Atanabilir kişiler",
    allContactsAssigned: "Tüm kişiler atandı",
    contactNotFound: "Kişi bulunamadı",
    allVisibleContactsAssigned: "Görünen kişilerin tamamı bu kategoride.",
    contactSearchHelp: "WhatsApp kişilerini yenileyin veya farklı bir arama yapın.",
    tapToRemoveCategory: "Dokunarak kategoriden kaldır",
    savedContact: "Kayıtlı kişi",
    mainMenu: "Ana Menü",
    overview: "Genel Bakış",
    overviewDescription: "Operasyon özeti ve hızlı işlemler.",
    accountsDescription: "Bağlı WhatsApp hesapları ve bağlantı durumu.",
    groupsMenuDescription: "Eşitlenen gruplar, filtreler ve kategori durumu.",
    categoriesMenuDescription: "Segmentler, atanmış hedefler ve kategori yönetimi.",
    messagingMenuDescription: "Kategori, grup ve kişi hedefli kampanya hazırlama.",
    historyMenuDescription: "Kampanya teslimatları ve zamanlı gönderimler.",
    supportMenuDescription: "Destek talepleri ve geri bildirim akışı.",
    adminSections: "Yönetici Bölümleri",
    adminControlCenter: "Yönetici Kontrol Merkezi",
    myAccount: "Hesabım",
    adminMobileDescription: "Web panelindeki yönetim bölümlerine bağlı mobil kontrol merkezi.",
    myAccountDescription: "Hesap, profil ve destek alanları.",
    companyInfoDescription: "Profil ve iletişim bilgilerinizi yönetin.",
    teamUsersMenuDescription: "Ekip kullanıcıları, roller ve erişim durumları.",
    subscriptionMenuDescription: "Plan ve abonelik durumu.",
    deleteAccountMenuDescription: "Hesap kapatma ve veri silme talebi.",
    logoutDeviceDescription: "Bu cihazdaki oturumu kapat.",
    currentPackage: "MEVCUT PAKET",
    days: "Gün",
    daysCount: "{count} gün",
    connectedWhatsApp: "Bağlı WhatsApp",
    totalGroups: "Toplam grup",
    sendableMetric: "Gönderilebilir",
    openTickets: "Açık talep",
    conversations: "Konuşmalar",
    system: "Sistem",
    tickets: "Talepler",
    whatsappScreenSubtitle: "WhatsApp hesaplarınızı bağlayın; grupları, mesaj gönderimini ve geçmişi tek çalışma alanından yönetin.",
    warnings: "Uyarı",
    categoryList: "Kategori Listesi",
    assignedTargets: "Atanan hedef",
    segmentColor: "Segment rengi",
    userProfileSubtitle: "Profil, ekip ve güvenlik ayarlarınızı yönetin.",
    sessionSecure: "Oturum güvende",
    subscriptionScreenSubtitle: "Paket ve abonelik dönem bilgileri.",
    sharedSubscription: "Paylaşılan abonelik",
    sharedSubscriptionExpired: "Paylaşılan aboneliğin süresi doldu",
    sharedSubscriptionExpiredDescription:
      "Paylaşılan abonelik sona erdi. Bilgilerinizi görmeye devam edebilir ve kendi planınız için talep oluşturabilirsiniz.",
    sharedSubscriptionReadOnly:
      "Bu plan çalışma alanı sahibi tarafından yönetilir. Abonelik bilgilerini görebilir ancak değiştiremezsiniz.",
    subscriptionOwner: "Abonelik sahibi",
    usersReadOnlySharedMembership:
      "Paylaşılan çalışma alanı üyeliğiniz salt okunurdur. Etkin üyeler diğer kullanıcıları değiştiremez.",
    sharedMembershipDeleteScope:
      "Bu işlem yalnızca paylaşılan çalışma alanı üyeliğinizi kapatır. Diğer kullanıcıların verileri korunur.",
    readOnlyMode: "Salt okunur mod aktif",
    readOnlyModeDescription: "Abonelik süresi dolduğunda veriler korunur; yenileme sonrası işlemler yeniden açılır.",
    teamManagement: "Kullanıcı Davet Et",
    teamManagementDescription: "Kullanıcıları davet edin ve yönetin.",
    manageTeamUsers: "Kullanıcı Davet Et",
    groupList: "Grup Listesi",
    refreshGroups: "Grupları yenile",
    refreshingGroups: "WhatsApp grupları yenileniyor",
    refreshingContacts: "WhatsApp kişileri yenileniyor",
    connectedContacts: "Bağlı kişiler",
    whatsappRefreshWithoutDisconnect: "Yeni kişi ve grupları WhatsApp bağlantısını kesmeden güncelleyin.",
    whatsappRefreshUnavailableTitle: "Yenileme kullanılamıyor",
    whatsappRefreshRequiresConnection: "Önce bu WhatsApp hesabının bağlı olduğundan emin olun.",
    whatsappGroupsRefreshCompleteTitle: "Gruplar güncellendi",
    whatsappGroupsRefreshCompleteDescription: "WhatsApp bağlantısı korunarak {count} grup güncellendi.",
    whatsappContactsRefreshCompleteTitle: "Kişiler güncellendi",
    whatsappContactsRefreshCompleteDescription: "WhatsApp bağlantısı korunarak {count} kişi güncellendi.",
    whatsappRefreshQueuedTitle: "Yenileme devam ediyor",
    whatsappGroupsRefreshQueuedDescription: "Grup yenileme işlemi arka planda sürüyor. Bağlantıyı kesmeniz gerekmez.",
    whatsappContactsRefreshQueuedDescription: "Kişi yenileme işlemi arka planda sürüyor. Bağlantıyı kesmeniz gerekmez.",
    whatsappContactsRefreshPartialDescription: "Şimdilik {count} kişi güncellendi. Kalan veriler arka planda tamamlanabilir.",
    whatsappRefreshFailedTitle: "Yenileme tamamlanamadı",
    whatsappGroupsRefreshFailed: "WhatsApp grupları yenilenemedi.",
    whatsappContactsRefreshFailed: "WhatsApp kişileri yenilenemedi.",
    dataPreparing: "Veriler hazırlanıyor",
    moduleLoadingDescription: "Bu bölüm açıldı. Web API verisi alınırken ekran kilitlenmez.",
    dataSource: "Veri kaynağı",
    records: "Kayıtlar",
    noRecords: "Kayıt bulunamadı",
    liveApi: "Canlı API",
    summaryApi: "Özet API",
    dataUnavailable: "Veri alınamadı.",
    supportTicketOpenFailed: "Destek talebi açılamadı.",
    replySent: "Yanıt gönderildi.",
    replyFailed: "Yanıt gönderilemedi.",
    ticketStatusUpdated: "Talep durumu güncellendi.",
    ticketStatusUpdateFailed: "Talep durumu güncellenemedi.",
    endpointUnavailable: "Bu modülü destekleyen web API endpoint'i bulunmuyor.",
    noModuleRecordsDescription: "Bu modül için gösterilecek kayıt yok veya mevcut endpoint yalnızca özet veri döndürüyor.",
    record: "Kayıt",
    updateStatus: "Durumu güncelle",
    writeReply: "Yanıt yaz",
    adminReply: "Yönetici yanıtı",
    userMessage: "Kullanıcı mesajı",
    systemMessage: "Sistem mesajı",
    requestTimedOut: "Veri isteği zaman aşımına uğradı.",
    ticketClosedReplyDisabled: "Talep kapalı olduğu için yanıt yazılamaz.",
    subjectMinLength: "Konu en az 3 karakter olmalıdır.",
    descriptionMinLength: "Açıklama en az 5 karakter olmalıdır.",
    issueDetailsPlaceholder: "Sorununuzu ayrıntılı yazın",
    you: "Siz",
    logivyaSupport: "Logivya Destek",
    verificationCode: "Doğrulama kodu",
    newPassword: "Yeni parola",
    passwordUpdated: "Parola güncellendi",
    passwordUpdatedDescription: "Yeni parolanızla giriş yapabilirsiniz.",
    passwordUpdateFailed: "Parola güncellenemedi",
    codeSent: "Kod gönderildi",
    codeSentDescription: "Bilgiler sistemde kayıtlıysa doğrulama kodu gönderilmiştir.",
    codeSendFailed: "Kod gönderilemedi",
    identifierPrompt: "E-posta veya telefon bilginizi girin.",
    sendVerificationCode: "Doğrulama kodu gönder",
    loginFailed: "Giriş yapılamadı",
    checkYourDetails: "Bilgilerinizi kontrol edin.",
    secureSessionSaveFailed: "Oturum güvenli şekilde kaydedilemedi. Lütfen tekrar deneyin.",
    newToLogivya: "Logivya'da yeni misiniz?",
    createAccountAction: "Hesap oluştur",
    alreadyHaveAccount: "Zaten hesabınız var mı?",
    signInAction: "Giriş yap",
    passwordConfirmation: "Parola tekrar",
    updatePassword: "Parolayı güncelle",
    acceptLabel: "Kabul ediyorum:",
    readAndAcceptLabel: "Okudum ve kabul ediyorum:",
    termsOfService: "Kullanım Şartları",
    privacyPolicy: "Gizlilik Politikası",
    dataProcessingNotice: "Veri İşleme Aydınlatma Metni",
    invitationLoginPrompt: "Ekip davetini kabul etmek için giriş yapın.",
    regularLogin: "Davetsiz giriş",
    invitationCodeOptional: "Davet kodu (isteğe bağlı)",
    approvalRequired: "Onay gerekli",
    legalAcceptanceRequired: "Devam etmek için kullanım şartlarını, gizlilik politikasını ve veri işleme metnini kabul edin.",
    registrationFailed: "Kayıt tamamlanamadı",
    invitationRegistration: "Ekip davetiyle kayıt oluyorsunuz.",
    requestReceived: "Talep alındı",
    accountDisabledDescription: "Hesabınız devre dışı bırakıldı ve oturumunuz kapatıldı.",
    accountDeleteFailed: "Hesap kapatılamadı",
    accountDeleteWarning: "Bu işlem hesabınızı devre dışı bırakır, aktif oturumları kapatır ve kampanyaları durdurur.",
    accountDeleteFullWarning: "Bu işlem hesabınızı devre dışı bırakır, aktif oturumları kapatır ve kampanyaları durdurur. Yasal olarak saklanması gereken ödeme, güvenlik ve denetim kayıtları mevzuat süresince korunabilir.",
    confirmationPrompt: "Devam etmek için aşağıdaki metni yazın:",
    confirmationTextLabel: "Onay metni",
    closeAccount: "Hesabı kapat",
    accountClosurePhrase: "LOGIVYA HESABIMI KAPAT",
    adminDashboardModule: "Yönetici Paneli",
    adminCompaniesModule: "Çalışma alanları",
    adminUsersModule: "Kullanıcılar",
    adminRolesModule: "Roller",
    adminBillingModule: "Faturalandırma",
    adminSubscriptionsModule: "Abonelikler",
    adminInvoicesModule: "Faturalar",
    adminPaymentsModule: "Ödemeler",
    adminWhatsAppModule: "WhatsApp Hesapları",
    adminCampaignsModule: "Kampanyalar",
    adminSupportModule: "Destek",
    adminSecurityModule: "Güvenlik",
    adminTrialRiskModule: "Deneme Riski",
    adminComplianceModule: "Uyumluluk",
    adminPrivacyModule: "Gizlilik Merkezi",
    adminPrivacyDescription: "Veri talepleri, dışa aktarma, silme, saklama ve ihlal süreçlerini izleyin.",
    adminAuditModule: "Denetim Merkezi",
    adminActivityModule: "Aktivite Merkezi",
    adminNotificationsModule: "Bildirimler",
    adminDataRequestsModule: "Veri Talepleri",
    adminMetricsModule: "Metrikler",
    adminSystemHealthModule: "Sistem Sağlığı",
    adminBackupsModule: "Yedekler",
    adminDisasterRecoveryModule: "Felaket Kurtarma",
    adminReleasesModule: "Sürüm Merkezi",
    adminSettingsModule: "Ayarlar",
    adminFeatureFlagsModule: "Özellik Bayrakları",
    adminAnnouncementsModule: "Duyurular",
    adminApiUsageModule: "API Kullanımı",
    adminWebhooksModule: "Webhooklar",
    adminPlatformSettingsModule: "Platform Ayarları"
    ,adminDashboardDescription: "Operasyon, abonelik ve platform durumu özeti."
    ,adminCompaniesDescription: "Platform çalışma alanları ve durum yönetimi."
    ,adminUsersDescription: "Kullanıcı, oturum, cihaz ve rol yönetimi."
    ,adminRolesDescription: "Yönetici, operatör ve destek rollerini yönetin."
    ,adminBillingDescription: "Fatura, ödeme ve abonelik akışları."
    ,adminSubscriptionsDescription: "Abonelik durumları ve manuel etkinleştirmeler."
    ,adminInvoicesDescription: "Fatura kayıtları ve durumları."
    ,adminPaymentsDescription: "Ödeme onay, ret ve tahsilat akışları."
    ,adminWhatsAppDescription: "Oturumlar, bağlı hesaplar ve bağlantı durumu."
    ,adminCampaignsDescription: "Mesaj ve kampanya operasyonları."
    ,adminSupportDescription: "Platform destek talepleri."
    ,adminSecurityDescription: "Güvenlik olayları ve erişim denetimi."
    ,adminTrialRiskDescription: "Deneme uygunluğu, risk sinyalleri ve manuel inceleme kararları."
    ,adminComplianceDescription: "İzinler ve veri sahibi süreçleri."
    ,adminAuditDescription: "Denetim kayıtları ve izlenebilirlik."
    ,adminActivityDescription: "Platform aktivite akışı."
    ,adminNotificationsDescription: "Yönetici bildirimleri ve okunma durumu."
    ,adminDataRequestsDescription: "Erişim, dışa aktarma ve silme talepleri."
    ,adminMetricsDescription: "Platform metrikleri ve kullanım göstergeleri."
    ,adminSystemHealthDescription: "Servis ve entegrasyon durumları."
    ,adminBackupsDescription: "Yedekleme ve geri yükleme operasyonları."
    ,adminDisasterRecoveryDescription: "Kurtarma planı ve operasyonel süreklilik."
    ,adminReleasesDescription: "İmzalı paketleri, doğrulama kontrollerini, testleri, onayları ve mağaza rollout kayıtlarını izleyin."
    ,adminSettingsDescription: "Yönetici ayarları ve platform yapılandırması."
    ,adminFeatureFlagsDescription: "Platform özelliklerinin operasyon durumu."
    ,adminAnnouncementsDescription: "Kullanıcı duyuruları ve platform mesajları."
    ,adminApiUsageDescription: "API ve entegrasyon kullanım sinyalleri."
    ,adminWebhooksDescription: "Webhook ve entegrasyon akışı."
    ,adminPlatformSettingsDescription: "Genel platform yapılandırması."
    ,"common.status": "Durum"
    ,"notification.category.marketplace": "Lojistik pazarı"
    ,"groups.unavailable": "Kullanılamıyor"
    ,"status.completed": "Tamamlandı"
    ,"status.sending": "Gönderiliyor"
    ,"status.partially_completed": "Kısmen tamamlandı"
    ,"status.scheduled": "Planlandı"
    ,"accountStatus.PENDING_QR": "Tarama bekleniyor"
    ,"accountStatus.CONNECTING": "Bağlanıyor"
    ,"accountStatus.CONNECTED": "Bağlandı"
    ,"accountStatus.DISCONNECTED": "Bağlantı kesildi"
    ,"accountStatus.RECONNECT_REQUIRED": "Yeniden bağlantı gerekli"
    ,"accountStatus.ARCHIVED": "Arşivlendi"
    ,"accountStatus.ERROR": "Başarısız"
    ,"status.queued": "Sırada"
    ,"status.failed": "Başarısız"
    ,"status.canceled": "İptal edildi"
    ,"status.draft": "Taslak"
    ,"priority.low": "Düşük"
    ,"priority.medium": "Orta"
    ,"priority.high": "Yüksek"
    ,"priority.urgent": "Acil"
    ,"status.open": "Açık"
    ,"status.pending": "Beklemede"
    ,"status.answered": "Yanıtlandı"
    ,"status.closed": "Kapalı"
    ,"status.active": "Aktif"
    ,"status.inactive": "Pasif"
    ,"status.unknown": "Bilinmiyor"
    ,"status.healthy": "Sağlıklı"
    ,"status.ok": "Çalışıyor"
    ,"adminSubscriptions.companiesLoadFailed": "Çalışma alanları yüklenemedi. Lütfen tekrar deneyin."
    ,"adminSubscriptions.manualActivationCreated": "Abonelik başarıyla etkinleştirildi ve denetim kaydı oluşturuldu."
    ,"adminSubscriptions.actionCompleted": "Abonelik işlemi tamamlandı."
    ,"adminSubscriptions.eyebrow": "Platform Yönetimi"
    ,"adminSubscriptions.title": "Manuel Abonelik Yönetimi"
    ,"adminSubscriptions.description": "Banka transferi ve manuel ödemeler için abonelikleri güvenli biçimde yönetin."
    ,"adminSubscriptions.shownCompanies": "Gösterilen çalışma alanları"
    ,"adminSubscriptions.activeSubscriptions": "Aktif abonelikler"
    ,"adminSubscriptions.trialAccounts": "Deneme hesapları"
    ,"adminSubscriptions.incompleteBillingProfiles": "Eksik fatura profilleri"
    ,"adminSubscriptions.selectCompany": "Çalışma alanı seçin"
    ,"adminSubscriptions.plan": "Plan"
    ,"adminSubscriptions.billingPeriod": "Faturalama dönemi"
    ,"adminSubscriptions.monthly": "Aylık"
    ,"adminSubscriptions.yearly": "Yıllık"
    ,"adminSubscriptions.startDate": "Başlangıç tarihi"
    ,"adminSubscriptions.endDate": "Bitiş tarihi"
    ,"adminSubscriptions.paymentMethod": "Ödeme yöntemi"
    ,"adminSubscriptions.bankTransfer": "Banka transferi"
    ,"adminSubscriptions.manual": "Manuel"
    ,"adminSubscriptions.freePromo": "Ücretsiz veya promosyon"
    ,"adminSubscriptions.currency": "Para birimi"
    ,"adminSubscriptions.actionReason": "İşlem gerekçesi"
    ,"adminSubscriptions.assignmentReasonPlaceholder": "Atama gerekçesini yazın"
    ,"adminSubscriptions.manualActivate": "Manuel etkinleştir"
    ,"adminSubscriptions.searchPlaceholder": "Çalışma alanı, kullanıcı, e-posta veya telefon ara"
    ,"adminSubscriptions.search": "Ara"
    ,"adminSubscriptions.billingProfile": "Fatura profili"
    ,"adminSubscriptions.seats": "Hesaplar"
    ,"adminSubscriptions.start": "Başlangıç"
    ,"adminSubscriptions.end": "Bitiş"
    ,"adminSubscriptions.trialDuration": "Deneme süresi"
    ,"adminSubscriptions.incomplete": "Eksik"
    ,"adminSubscriptions.reconciliationRequired": "Uzlaştırma gerekli"
    ,"adminSubscriptions.configurationRequired": "Yapılandırma gerekli"
    ,"adminSubscriptions.noActivePackage": "Aktif paket yok"
    ,"adminSubscriptions.extensionDays": "Uzatma süresi (gün)"
    ,"adminSubscriptions.viewDetails": "Detayları görüntüle"
    ,"adminSubscriptions.action": "Abonelik işlemi"
    ,"adminSubscriptions.actionWarning": "Bu işlem abonelik durumunu ve erişim haklarını değiştirebilir. Devam etmek için bir gerekçe girin."
    ,"adminSubscriptions.newEndDate": "Yeni bitiş tarihi"
    ,"adminSubscriptions.newPlan": "Yeni plan"
    ,"adminSubscriptions.actionDescription": "İşlem açıklaması"
    ,"adminSubscriptions.actionReasonPlaceholder": "İşlem gerekçesini yazın"
    ,"adminSubscriptions.dismiss": "Vazgeç"
    ,"adminSubscriptions.processing": "İşleniyor..."
    ,"adminSubscriptions.confirm": "Onayla"
    ,"adminSubscriptions.trialRemaining": "{duration} gün · {remaining} gün kaldı"
    ,"adminSubscriptions.trialExpired": "{duration} gün · Sona erdi"
    ,"adminSubscriptions.action.activate": "Etkinleştir"
    ,"adminSubscriptions.action.extend": "Uzat"
    ,"adminSubscriptions.action.suspend": "Askıya al"
    ,"adminSubscriptions.action.cancel": "İptal et"
    ,"adminSubscriptions.action.change_plan": "Plan değiştir"
    ,"adminSubscriptions.seatReconciliationError": "Plan değiştirilemedi: {used} hesap kullanımda ve hedef plan {limit} hesaba izin veriyor. Önce fazla üyeleri askıya alın veya kaldırın."
    ,"adminSubscriptions.billingProfileIncomplete": "Fatura profili eksik."
    ,"adminSubscriptions.validationError": "Zorunlu alanları ve tarih aralığını kontrol edin."
    ,"adminSubscriptions.genericError": "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin."
    ,"adminPayments.approved": "Ödeme onaylandı."
    ,"adminPayments.rejectionReason": "Ödeme reddetme nedeni (en az 5 karakter):"
    ,"adminPayments.rejected": "Ödeme reddedildi."
    ,"adminPayments.eyebrow": "Faturalandırma Operasyonları"
    ,"adminPayments.title": "Ödemeler"
    ,"adminPayments.description": "Ödeme taleplerini inceleyin, onaylayın veya açık bir gerekçeyle reddedin."
    ,"adminPayments.amount": "Tutar"
    ,"adminPayments.approve": "Onayla"
    ,"adminPayments.reject": "Reddet"
    ,"adminPayments.empty": "Ödeme kaydı bulunmuyor."
    ,"adminSupport.internalNote": "İç not"
    ,"adminSupport.adminReply": "Yönetici yanıtı"
    ,"adminSupport.userMessage": "Kullanıcı mesajı"
    ,"adminSupport.systemMessage": "Sistem mesajı"
    ,"adminSupport.statusUpdateFailed": "Talep durumu güncellenemedi."
    ,"adminSupport.statusUpdated": "Talep durumu güncellendi."
    ,"adminSupport.eyebrow": "Logivya Destek Operasyonları"
    ,"adminSupport.title": "Destek Talepleri"
    ,"adminSupport.description": "Tüm çalışma alanlarından gelen destek taleplerini tek bir merkezi akıştan yönetin."
    ,"adminSupport.searchPlaceholder": "Konu, çalışma alanı, kullanıcı veya e-posta ara..."
    ,"adminSupport.refresh": "Yenile"
    ,"adminSupport.all": "Tümü"
    ,"adminSupport.ticketCount": "{count} destek talebi"
    ,"adminSupport.ticket": "Talep"
    ,"adminSupport.userEmail": "Kullanıcı e-postası"
    ,"adminSupport.lastMessage": "Son mesaj"
    ,"adminSupport.openTicket": "Talebi aç"
    ,"adminSupport.previous": "Önceki"
    ,"adminSupport.page": "Sayfa {page} / {pages}"
    ,"adminSupport.next": "Sonraki"
    ,"adminSupport.ticketLoading": "Talep yükleniyor..."
    ,"adminSupport.selectTicket": "Detayları görmek için bir talep seçin."
    ,"adminSupport.ticketStatus": "Talep durumu"
    ,"adminSupport.update": "Güncelle"
    ,"adminSupport.writeReply": "Yanıt yaz"
    ,"adminSupport.replyPlaceholder": "Kullanıcıya yanıt yazın..."
    ,"adminSupport.sendReply": "Yanıt gönder"
    ,"adminSupport.threadNotice": "Kullanıcı ve yönetici yanıtları gerçek zamanlı yenilemenin ardından bu konuşma akışında görünür."
    ,"status.in_progress": "İşlemde"
    ,"status.resolved": "Çözüldü"
    ,"common.yes": "Evet"
    ,"common.no": "Hayır"
    ,"notification.title.ACCOUNT_ARCHIVED": "WhatsApp hesabı arşivlendi"
    ,"notification.title.PAYMENT_RECEIVED": "Ödeme alındı"
    ,"notification.title.PAYMENT_REJECTED": "Ödeme reddedildi"
    ,"notification.title.SUPPORT_REPLY": "Yeni destek yanıtı"
    ,"notification.title.SUBSCRIPTION_ACTIVATED": "Abonelik etkinleştirildi"
    ,"notification.title.SUBSCRIPTION_CANCELED": "Abonelik iptal edildi"
    ,"notification.title.SUBSCRIPTION_EXPIRED": "Abonelik süresi doldu"
    ,"notification.title.TRIAL_EXPIRED": "Deneme süresi doldu"
    ,"notification.title.TRIAL_STARTED": "Deneme başladı"
    ,"payment.status.pending": "Beklemede"
    ,"payment.status.paid": "Ödendi"
    ,"payment.status.succeeded": "Başarılı"
    ,"payment.status.failed": "Başarısız"
    ,"payment.status.refunded": "İade edildi"
    ,"payment.status.canceled": "İptal edildi"
    ,"adminFeatureFlags.enabled": "Aktif"
    ,"adminFeatureFlags.disabled": "Kapalı"
    ,"adminPlatform.configured": "Yapılandırıldı"
    ,"adminPlatform.notConfigured": "Yapılandırılmadı"
    ,"status.deleted": "Silindi"
    ,"status.suspended": "Askıya alındı"
    ,"accountStatus.FAILED": "Başarısız"
    ,"accountStatus.RECONNECTING": "Yeniden bağlanıyor"
    ,"dataRequest.status.requested": "Talep edildi"
    ,"dataRequest.status.verifying": "Doğrulanıyor"
    ,"dataRequest.status.processing": "İşleniyor"
    ,"dataRequest.status.completed": "Tamamlandı"
    ,"dataRequest.status.rejected": "Reddedildi"
    ,"security.event.SUSPICIOUS_LOGIN": "Şüpheli giriş"
    ,"security.event.AUTH_FAILURE": "Kimlik doğrulama hatası"
    ,"security.event.ACCESS_DENIED": "Erişim engellendi"
    ,"webhook.status.pending": "Beklemede"
    ,"webhook.status.delivered": "Teslim edildi"
    ,"webhook.status.failed": "Başarısız"
    ,"webhook.status.dead_letter": "Ölü mektup"
    ,"adminBackups.runbookReady": "Çalışma kitabı hazır"
    ,"status.whatsapp.connected": "Bağlı"
    ,"status.whatsapp.disconnected": "Bağlı değil"
    ,"status.whatsapp.failed": "Bağlantı başarısız"
    ,"status.whatsapp.error": "Bağlantı başarısız"
    ,"status.whatsapp.pending_qr": "QR kod bekleniyor"
    ,"status.whatsapp.qr_ready": "QR kod hazır"
    ,"status.whatsapp.pending_phone": "Telefon kodu bekleniyor"
    ,"status.whatsapp.pending_pairing": "Telefon kodu bekleniyor"
    ,"status.whatsapp.pairing_code_ready": "Telefon kodu hazır"
    ,"status.whatsapp.connecting": "Bağlanıyor"
    ,"status.whatsapp.reconnecting": "Yeniden bağlanıyor"
    ,"status.whatsapp.reconnect_required": "Yeniden bağlantı gerekli"
    ,"status.whatsapp.archived": "Arşivlendi"
    ,"status.subscription.trial": "Deneme"
    ,"status.subscription.active": "Aktif"
    ,"status.subscription.expired": "Süresi doldu"
    ,"status.subscription.suspended": "Askıya alındı"
    ,"status.subscription.cancelled": "İptal edildi"
    ,"status.subscription.manual_pending": "Onay bekliyor"
    ,"status.subscription.past_due": "Ödeme gecikti"
    ,"status.payment.pending": "Bekliyor"
    ,"status.payment.manually_confirmed": "Manuel onaylandı"
    ,"status.payment.paid": "Ödendi"
    ,"status.payment.succeeded": "Başarılı"
    ,"status.payment.failed": "Başarısız"
    ,"status.payment.rejected": "Reddedildi"
    ,"status.payment.refunded": "İade edildi"
    ,"status.payment.canceled": "İptal edildi"
    ,"status.invoice.draft": "Taslak"
    ,"status.invoice.issued": "Kesildi"
    ,"status.invoice.paid": "Ödendi"
    ,"status.invoice.cancelled": "İptal edildi"
    ,"status.invoice.failed": "Başarısız"
    ,"status.message.completed": "Tamamlandı"
    ,"status.message.partially_completed": "Kısmen tamamlandı"
    ,"status.message.failed": "Başarısız"
    ,"status.message.pending": "Bekliyor"
    ,"status.message.queued": "Sırada"
    ,"status.message.scheduled": "Planlandı"
    ,"status.message.sending": "Gönderiliyor"
    ,"status.message.cancelled": "İptal edildi"
    ,"status.message.deleted": "Silindi"
    ,"status.message.draft": "Taslak"
    ,"notification.title.whatsapp.connected": "WhatsApp bağlandı"
    ,"notification.title.whatsapp.disconnected": "WhatsApp bağlantısı kesildi"
    ,"notification.title.whatsapp.qr_expired": "QR kodun süresi doldu"
    ,"notification.title.whatsapp.qr_connected": "QR bağlantısı tamamlandı"
    ,"notification.title.whatsapp.phone_code_connected": "Telefon kodu kabul edildi"
    ,"notification.title.whatsapp.account_archived": "WhatsApp hesabı arşivlendi"
    ,"notification.title.whatsapp.account_deleted": "WhatsApp hesabı silindi"
    ,"notification.title.campaign.completed": "Kampanya tamamlandı"
    ,"notification.title.campaign.failed": "Kampanya başarısız"
    ,"notification.title.campaign.partial_delivery": "Kampanya kısmen teslim edildi"
    ,"notification.title.campaign.scheduled_started": "Zamanlanmış kampanya başladı"
    ,"notification.title.campaign.scheduled_finished": "Zamanlanmış kampanya tamamlandı"
    ,"notification.title.subscription.trial_ending": "Deneme süresi yakında bitiyor"
    ,"notification.title.subscription.trial_expired": "Deneme süresi sona erdi"
    ,"notification.title.subscription.activated": "Abonelik etkinleştirildi"
    ,"notification.title.subscription.renewed": "Abonelik yenilendi"
    ,"notification.title.subscription.cancelled": "Abonelik iptal edildi"
    ,"notification.title.subscription.payment_failed": "Abonelik ödemesi başarısız"
    ,"notification.title.support.ticket_created": "Destek talebi oluşturuldu"
    ,"notification.title.support.admin_replied": "Yeni destek yanıtı"
    ,"notification.title.support.ticket_closed": "Destek talebi kapatıldı"
    ,"notification.title.support.ticket_reopened": "Destek talebi yeniden açıldı"
    ,"notification.title.admin.company_registered": "Yeni hesap kaydı"
    ,"notification.title.admin.payment_created": "Yeni ödeme alındı"
    ,"notification.title.admin.trial_expiring": "Müşteri denemesi bitiyor"
    ,"notification.title.admin.high_priority_support_ticket": "Yüksek öncelikli destek talebi"
    ,"notification.title.admin.whatsapp_account_failure": "WhatsApp hesap hatası"
    ,"status.waiting_for_user": "Kullanıcı yanıtı bekleniyor"
    ,"status.waiting_for_admin": "Destek yanıtı bekleniyor"
    ,"priority.normal": "Normal"
    ,"notification.title.support.admin_new_ticket": "Yeni destek talebi"
    ,"notification.title.support.user_replied": "Yeni kullanıcı yanıtı"
    ,"notification.title.support.status_changed": "Destek talebi güncellendi"
    ,"notification.channel.in_app": "Uygulama içi"
    ,"notification.channel.email": "E-posta"
    ,"notification.channel.android_push": "Android anlık bildirim"
    ,"notification.channel.ios_push": "iOS anlık bildirim"
    ,"notification.channel.web_push": "Web anlık bildirim"
    ,"notification.category.account": "Hesap"
    ,"notification.category.security": "Güvenlik"
    ,"notification.category.support": "Destek"
    ,"notification.category.subscription": "Abonelik"
    ,"notification.category.billing": "Faturalandırma"
    ,"notification.category.invitation": "Davet"
    ,"notification.category.whatsapp": "WhatsApp"
    ,"notification.category.message": "Mesaj"
    ,"notification.category.system": "Sistem"
    ,"notification.category.marketing": "Pazarlama"
    ,"notification.category.compliance": "Uyumluluk"
    ,"notification.category.administration": "Yönetim"
    ,"notification.category.backup": "Yedekleme"
    ,"notification.category.incident": "Olay"
    ,"notifications.admin.platformAnnouncement": "Platform duyurusu"
    ,"notifications.admin.platformAnnouncementDescription": "Bir taslak oluşturun, tam hedef kitlesini ve kanallarını inceleyin, ardından yayını açıkça onaylayın."
    ,"notifications.admin.title": "Başlık"
    ,"notifications.admin.message": "Mesaj"
    ,"notifications.admin.deepLink": "Uygulama içi bağlantı (isteğe bağlı)"
    ,"notifications.admin.locale": "Dil"
    ,"notifications.admin.priority": "Öncelik"
    ,"notifications.admin.channels": "Kanallar"
    ,"notifications.admin.startTime": "Başlangıç zamanı"
    ,"notifications.admin.endTime": "Bitiş zamanı (isteğe bağlı)"
    ,"notifications.admin.createDraft": "Taslak oluştur"
    ,"notifications.admin.previewAndPublish": "Önizle ve yayınla"
    ,"notifications.admin.cancel": "İptal et"
    ,"notifications.admin.noAnnouncements": "Henüz duyuru taslağı yok."
    ,"notifications.admin.unresolvedDeadLetters": "Çözümlenmemiş kalıcı hatalar"
    ,"notifications.admin.deadLetterDescription": "Yalnızca sağlayıcı veya yapılandırma sorunu giderildikten sonra yeniden deneyin."
    ,"notifications.admin.event": "Olay"
    ,"notifications.admin.channel": "Kanal"
    ,"notifications.admin.error": "Hata"
    ,"notifications.admin.attempts": "Deneme"
    ,"notifications.admin.date": "Tarih"
    ,"notifications.admin.retry": "Yeniden dene"
    ,"notifications.admin.noDeadLetters": "Çözümlenmemiş kalıcı hata yok."
    ,"notifications.admin.versionedTemplates": "Sürümlü bildirim şablonları"
    ,"notifications.admin.versionedTemplatesDescription": "Yeni sürümler taslak olarak başlar ve açık yönetici onayı gerektirir."
    ,"notifications.admin.templateName": "Şablon adı"
    ,"notifications.admin.emailSubject": "E-posta konusu"
    ,"notifications.admin.templateBody": "{{variable}} yer tutucuları içeren mesaj metni"
    ,"notifications.admin.requiredVariables": "Gerekli değişkenler, virgülle ayrılmış"
    ,"notifications.admin.preview": "Önizle"
    ,"notifications.admin.testSelf": "Kendime test gönder"
    ,"notifications.admin.active": "Aktif"
    ,"notifications.admin.approve": "Onayla"
    ,"notifications.admin.noTemplates": "Henüz sürümlü şablon yok. Kod yedekleri aktif kalır."
    ,"notifications.admin.providerReadiness": "Sağlayıcı hazırlığı"
    ,"notifications.admin.providerReadinessDescription": "Yalnızca güvenli yapılandırma bilgileri gösterilir. Kimlik bilgileri asla döndürülmez."
    ,"notifications.admin.draftCreated": "Duyuru taslağı oluşturuldu."
    ,"notifications.admin.draftFailed": "Duyuru taslağı oluşturulamadı."
    ,"notifications.admin.previewStale": "Duyuru önizlemesi artık güncel değil."
    ,"notifications.admin.audience": "Hedef kitle"
    ,"notifications.admin.platformAllUsers": "Tüm platform kullanıcıları"
    ,"notifications.admin.schedule": "Zamanlama"
    ,"notifications.admin.continueConfirmation": "Kontrollü yayın onayına devam edilsin mi?"
    ,"notifications.admin.typeExactly": "Tam olarak yazın"
    ,"notifications.admin.confirmationMismatch": "Onay metni eşleşmiyor."
    ,"notifications.admin.largeAudience": "Geniş hedef kitle onayı"
    ,"notifications.admin.publishFailed": "Duyuru yayınlanamadı."
    ,"notifications.admin.announcementQueued": "Duyurunun kuyruğa alındığı alıcı sayısı"
    ,"notifications.admin.cancelReason": "İptal nedenini girin (en az 5 karakter)."
    ,"notifications.admin.announcementCanceled": "Duyuru iptal edildi."
    ,"notifications.admin.cancelFailed": "Duyuru iptal edilemedi."
    ,"notifications.admin.retryReason": "Yeniden denemeden önce giderilen nedeni açıklayın (en az 5 karakter)."
    ,"notifications.admin.retryQueued": "Teslimat güvenli yeniden deneme kuyruğuna alındı."
    ,"notifications.admin.retryFailed": "Teslimat yeniden deneme kuyruğuna alınamadı."
    ,"notifications.admin.templateDraftCreated": "Şablon taslağı oluşturuldu."
    ,"notifications.admin.templateCreateFailed": "Şablon taslağı oluşturulamadı."
    ,"notifications.admin.templateApproved": "Şablon onaylandı ve etkinleştirildi."
    ,"notifications.admin.templateApproveFailed": "Şablon onaylanamadı."
    ,"notifications.admin.templatePreviewFailed": "Şablon önizlemesi oluşturulamadı."
    ,"notifications.admin.testConfirm": "Yalnızca yönetici hesabınıza kontrollü test gönderilsin mi?"
    ,"notifications.admin.testCompleted": "Kontrollü test yönetici hesabınıza gönderildi."
    ,"notifications.admin.testFailed": "Kontrollü test gönderilemedi."
    ,"notifications.admin.priorityLow": "Düşük"
    ,"notifications.admin.priorityNormal": "Normal"
    ,"notifications.admin.priorityHigh": "Yüksek"
    ,"notifications.admin.priorityCritical": "Kritik"
    ,"adminReleases.blocked": "Engellenen"
    ,"adminSubscriptions.manual.sellerConfigurationTitle": "LOGIVYA Satıcı ve Hukuki Belge Yapılandırması"
    ,"adminSubscriptions.manual.sellerConfigurationDescription": "Resmi satıcı bilgilerini ve hukuki belge durumunu buradan yönetin."
    ,"adminSubscriptions.manual.officialSellerName": "Resmi satıcı adı / ticari unvan"
    ,"adminSubscriptions.manual.tradeRegistryNumber": "Ticaret sicil numarası"
    ,"adminSubscriptions.manual.notApplicableSoleProprietor": "Bireysel hesap için uygulanmıyor"
    ,"adminSubscriptions.manual.mersisNumber": "MERSİS numarası"
    ,"adminSubscriptions.manual.verifySellerIdentity": "Girilen satıcı kimliğini resmi belgelerden kontrol ettim."
    ,"adminSubscriptions.manual.verifyLegalDocuments": "LOGIVYA hukuki metinlerinin profesyonel incelemesi tamamlandı."
    ,"adminSubscriptions.manual.configurationSource": "Değişiklik gerekçesi"
    ,"adminSubscriptions.manual.configurationSourcePlaceholder": "Belge ve doğrulama kaynağını belirtin"
    ,"adminSubscriptions.manual.configurationReady": "Kullanıma hazır"
    ,"adminSubscriptions.manual.missingFields": "{count} eksik alan"
    ,"adminSubscriptions.manual.configurationSavedReady": "Satıcı yapılandırması kaydedildi ve Havale/EFT talep ekranı kullanıma hazır."
    ,"adminSubscriptions.manual.configurationSavedMissing": "Yapılandırma kaydedildi. Eksik alanlar: {fields}"
    ,"adminSubscriptions.manual.configurationSaveFailed": "Satıcı yapılandırması kaydedilemedi."
    ,"adminSubscriptions.manual.saveConfiguration": "Yapılandırmayı Kaydet"
    ,"adminSubscriptions.manual.takeReview": "İncelemeye al"
    ,"adminSubscriptions.manual.approvePayment": "Ödemeyi onayla"
    ,"adminSubscriptions.manual.requestClarification": "Açıklama iste"
    ,"adminSubscriptions.manual.rejectRequest": "Talebi reddet"
    ,"adminSubscriptions.manual.bankChecked": "LOGIVYA banka hesabını kontrol ettim; tutar ve sipariş kodu bu taleple eşleşiyor."
    ,"adminSubscriptions.manual.customerNote": "Kullanıcıya gösterilecek açıklama"
    ,"adminSubscriptions.manual.internalNote": "İç yönetici notu"
    ,"notification.title.marketplace.request_match_found": "Talebinize uygun ilan bulundu"
    ,groupsLoadFailed: "Gruplar yüklenemedi."
    ,dashboardLoadFailed: "Genel bakış yüklenemedi."
    ,profileLoadFailed: "Profil bilgileri alınamadı."
    ,categoriesLoadFailed: "Kategoriler yüklenemedi."
    ,categoryCreated: "Kategori oluşturuldu."
    ,categoryCreateFailed: "Kategori oluşturulamadı."
    ,categoryUpdated: "Kategori güncellendi."
    ,categoryUpdateFailed: "Kategori güncellenemedi."
    ,categoryDeleted: "Kategori silindi."
    ,categoryDeleteFailed: "Kategori silinemedi."
    ,notificationsLoadMoreFailed: "Daha fazla bildirim alınamadı."
    ,notificationUpdateFailed: "Bildirim güncellenemedi."
    ,notificationsUpdateFailed: "Bildirimler güncellenemedi."
    ,subscriptionLoadFailed: "Abonelik bilgileri alınamadı."
    ,subscriptionUpgradeFailed: "Paket yükseltme talebi oluşturulamadı."
    ,billingProfileIncompleteError: "Abonelik talebi için profil ve iletişim bilgilerinizi tamamlayın."
    ,billingCheckoutUnavailableError: "Satın alma işlemi şu anda tamamlanamadı. Lütfen LOGIVYA desteğiyle iletişime geçin."
    ,billingLegalConsentRequiredError: "Devam etmek için üç hukuki metni ayrı ayrı okuyup kabul edin."
    ,"billing.manual.selectPlan": "Paketi Seç"
    ,"billing.manual.selected": "Seçildi"
    ,"billing.manual.consentTitle": "Sözleşme Onayı"
    ,"billing.manual.consentDescription": "Aşağıdaki bilgiler sipariş özetinize eklenecektir."
    ,"billing.manual.purchase": "Satın Al"
    ,"billing.ios.managedTitle": "Abonelik bilgileri"
    ,"billing.ios.managedDescription": "Mevcut paketiniz yukarıda gösterilir. Mağaza sürümünde abonelik satışı veya dijital özellik satın alma işlemi sunulmaz."
    ,"billing.ios.storeTitle": "Apple üzerinden abonelik"
    ,"billing.ios.storeDescription": "Paketinizi App Store üzerinden güvenli biçimde etkinleştirin."
    ,"billing.ios.loadingProducts": "App Store paketleri yükleniyor..."
    ,"billing.ios.subscribe": "Apple ile abone ol"
    ,"billing.ios.restore": "Satın alımları geri yükle"
    ,"billing.ios.restored": "Satın alımınız geri yüklendi."
    ,"billing.ios.nothingToRestore": "Geri yüklenecek aktif bir satın alım bulunamadı."
    ,"billing.ios.purchaseSuccess": "Aboneliğiniz etkinleştirildi."
    ,"billing.ios.purchaseFailed": "Apple satın alma işlemi tamamlanamadı."
    ,"billing.ios.productsUnavailable": "App Store paketleri şu anda alınamıyor. Lütfen tekrar deneyin."
    ,"billing.ios.ownerOnly": "Abonelik satın alma ve yenileme işlemlerini çalışma alanı sahibi yapabilir."
    ,"billing.ios.renewalDisclosure": "Abonelik, geçerli dönem bitmeden en az 24 saat önce iptal edilmezse otomatik yenilenir. Ödeme Apple hesabınızdan alınır. Aboneliğinizi App Store hesap ayarlarından yönetebilirsiniz."
    ,"billing.ios.trialDisclosure": "Uygunsanız 7 günlük ücretsiz deneme Apple tarafından uygulanır."
    ,"billing.ios.terms": "Kullanım Koşulları"
    ,"billing.ios.privacy": "Gizlilik Politikası"
    ,"billing.google.storeTitle": "Google Play üzerinden abonelik"
    ,"billing.google.storeDescription": "Paketinizi Google Play üzerinden güvenli biçimde etkinleştirin."
    ,"billing.google.loadingProducts": "Google Play paketleri yükleniyor..."
    ,"billing.google.subscribe": "Google Play ile abone ol"
    ,"billing.google.restore": "Satın alımları geri yükle"
    ,"billing.google.restored": "Satın alımınız geri yüklendi."
    ,"billing.google.nothingToRestore": "Geri yüklenecek aktif bir satın alım bulunamadı."
    ,"billing.google.purchaseSuccess": "Aboneliğiniz etkinleştirildi."
    ,"billing.google.purchaseFailed": "Google Play satın alma işlemi tamamlanamadı."
    ,"billing.google.productsUnavailable": "Google Play paketleri şu anda alınamıyor. Lütfen tekrar deneyin."
    ,"billing.google.ownerOnly": "Abonelik satın alma ve yenileme işlemlerini çalışma alanı sahibi yapabilir."
    ,"billing.google.renewalDisclosure": "Abonelik Google Play koşullarına göre otomatik yenilenir. Ödeme Google Play hesabınızdan alınır. Aboneliğinizi Google Play hesap ayarlarından yönetebilirsiniz."
    ,"billing.google.terms": "Kullanım Koşulları"
    ,"billing.google.privacy": "Gizlilik Politikası"
    ,"billing.manual.distanceSalesAgreement": "Mesafeli Satış Sözleşmesi"
    ,"billing.manual.preInformationForm": "Ön Bilgilendirme Formu"
    ,"billing.manual.refundPolicy": "İade ve Cayma Hakkı Politikası"
    ,"billing.manual.consentText": "Mesafeli Satış Sözleşmesi'ni, Ön Bilgilendirme Formu'nu ve İade ve Cayma Hakkı Politikası'nı okudum ve kabul ediyorum. Dijital hizmetin ödeme onayı ve paket etkinleştirmesinden sonra başlatılmasını talep ediyorum."
    ,"billing.manual.requestCreatedTitle": "Abonelik talebiniz oluşturuldu"
    ,"billing.manual.requestCreatedDescription": "Ödemeniz kontrol edildikten sonra paketiniz yönetici tarafından etkinleştirilecektir."
    ,"billing.manual.pendingPayment": "Ödeme Bekleniyor"
    ,"billing.manual.paymentReview": "Ödeme İnceleniyor"
    ,"billing.manual.approved": "Onaylandı"
    ,"billing.manual.rejected": "Reddedildi"
    ,"billing.manual.viewPaymentDetails": "Ödeme Bilgilerini Görüntüle"
    ,"billing.manual.bankName": "Banka Adı"
    ,"billing.manual.accountHolder": "Hesap Sahibi"
    ,"billing.manual.paymentReference": "Ödeme Açıklaması"
    ,"billing.manual.registeredEmail": "Kayıtlı E-posta"
    ,"billing.manual.profileFirstNameMissing": "Satın alma için kayıtlı ad bilginiz eksik."
    ,"billing.manual.profileLastNameMissing": "Satın alma için kayıtlı soyad bilginiz eksik."
    ,"billing.manual.profileEmailMissing": "Satın alma için kayıtlı e-posta bilginiz eksik."
    ,"billing.manual.activeSharedMembership": "Aktif ortak üyeliğiniz sona ermeden kişisel paket talebi oluşturamazsınız."
    ,"billing.manual.consentRequired": "Sözleşmeleri ve dijital hizmetin ödeme onayından sonra başlatılmasını kabul etmelisiniz."
    ,"billing.manual.copy": "Kopyala"
    ,"billing.manual.myRequests": "Abonelik Taleplerim"
    ,"billing.manual.newAdminRequest": "Yeni abonelik talebi"
    ,"billing.manual.paymentApprovedTitle": "Abonelik ödemeniz onaylandı"
    ,"billing.manual.duplicatePending": "Bu paket için zaten bekleyen bir abonelik talebiniz bulunuyor."
    ,"billing.manual.unspecified": "Belirtilmedi"
    ,"billing.manual.close": "Kapat"
    ,"billing.manual.transferInstruction": "Ödeme yaparken açıklama alanına LOGIVYA'ya kayıtlı e-posta adresinizi yazın. Açıklamadaki e-posta, LOGIVYA hesabınızdaki e-posta ile aynı olmalıdır."
    ,"billing.manual.requestDate": "Talep tarihi"
    ,"billing.manual.paymentPeriod": "Ödeme dönemi"
    ,"billing.manual.amount": "Tutar"
    ,"billing.manual.transferDetails": "Havale / EFT bilgileri"
    ,"billing.manual.requestHistoryDescription": "Havale/EFT taleplerinizi ve yönetici inceleme durumunu buradan takip edebilirsiniz."
    ,"billing.manual.noRequests": "Henüz abonelik talebiniz bulunmuyor."
    ,"billing.manual.cancelRequest": "Talebi iptal et"
    ,"billing.manual.purchaseFailed": "Satın alma işlemi şu anda tamamlanamadı. Lütfen LOGIVYA desteğiyle iletişime geçin."
    ,"billing.manual.submitting": "Talep oluşturuluyor..."
    ,"billing.manual.legalDocuments": "Hukuki belgeler"
    ,"billing.manual.serviceProvider": "Satıcı / Hizmet Sağlayıcı"
    ,"billing.manual.purchaserInfo": "Alıcı bilgileri"
    ,"billing.manual.orderSummary": "Sipariş özeti"
    ,"billing.manual.cancel": "Vazgeç"
    ,"billing.manual.plan": "Plan"
    ,"billing.manual.account": "Hesap"
    ,"billing.manual.brandingSignature": "LOGIVYA imzası"
    ,"billing.manual.brandingVisible": "Mesajlarda görünür"
    ,"billing.manual.brandingHidden": "Mesajlarda görünmez"
    ,"billing.manual.nameTitle": "Ad soyad"
    ,"billing.manual.email": "E-posta"
    ,"billing.manual.phone": "Telefon"
    ,"billing.manual.address": "Adres"
    ,"billing.manual.tax": "Vergi"
    ,"billing.manual.status": "Durum"
    ,supportTicketsLoadFailed: "Destek talepleri yüklenemedi."
    ,supportTicketCreated: "Destek talebiniz oluşturuldu."
    ,supportTicketCreateFailed: "Destek talebi oluşturulamadı."
    ,whatsappAccountsRetry: "Hesaplar yüklenemedi. Tekrar deneyin."
    ,whatsappAccountsLoadFailed: "WhatsApp hesapları yüklenemedi."
    ,whatsappQrCreateFailed: "QR kod oluşturulamadı."
    ,whatsappPhoneCodeCreateFailed: "Telefon kodu oluşturulamadı."
    ,whatsappConnectionFailed: "Bağlantı kurulamadı."
    ,whatsappStatusLoadFailed: "Bağlantı durumu alınamadı."
    ,turkeyMobilePhoneInvalid: "Lütfen geçerli bir Türkiye mobil numarası girin."
    ,roleManager: "Yönetici"
    ,roleSupport: "Destek"
    ,roleUser: "Kullanıcı"
    ,roleSuperAdmin: "Süper Yönetici"
    ,subscriptionInactiveError: "Aboneliğiniz aktif değil. Mesaj göndermek için paketinizi yenileyin."
    ,messagingPermissionDeniedError: "Mesaj gönderme yetkiniz yok."
    ,operationForbiddenError: "Bu işlem için yetkiniz yok."
    ,alreadyMemberError: "Bu e-posta adresiyle kayıtlı kullanıcı zaten ekibinizde."
    ,invitationAlreadyPendingError: "Bu e-posta adresine daha önce davet gönderilmiş."
    ,selfInvitationError: "Kendi e-posta adresinize davet gönderemezsiniz."
    ,invalidInvitationEmailError: "Geçerli bir e-posta adresi girin."
    ,invitationNameRequiredError: "Ad ve soyad alanlarını doldurun."
    ,invitationPermissionDeniedError: "Kullanıcı davet etme yetkiniz bulunmuyor."
    ,invitationDeliveryConfigurationError: "Davet e-postası servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."
    ,invitationRequestFailedError: "Davet işlemi şu anda tamamlanamadı."
    ,userSeatLimitReachedError: "Paketinizin kullanıcı limitine ulaştınız."
    ,networkTimeoutError: "Sunucu yanıt vermedi. Lütfen tekrar deneyin."
    ,secureConnectionError: "Güvenli bağlantı kurulamadı. Cihaz tarihini, saatini ve internet bağlantınızı kontrol edin."
    ,dnsError: "Sunucu adresi çözümlenemedi. İnternet bağlantınızı kontrol edin."
    ,serverUnreachableError: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin."
    ,invalidCredentialsError: "E-posta, telefon numarası veya parola hatalı."
    ,mobileAccessDeniedError: "Bu hesabın mobil erişim yetkisi bulunmuyor."
    ,invalidInputError: "Girilen bilgiler geçersiz."
    ,accountExistsError: "Bu bilgilerle kayıtlı bir hesap var."
    ,serviceConfigurationError: "Servis yapılandırması eksik. Lütfen daha sonra tekrar deneyin."
    ,whatsappServiceUnavailableError: "WhatsApp bağlantı ve mesaj servisi şu anda çalışmıyor. Lütfen servis yeniden başlatıldıktan sonra tekrar deneyin."
    ,serverError: "Sunucu hatası. Lütfen daha sonra tekrar deneyin."
    ,operationFailedError: "İşlem şu anda tamamlanamadı."
    ,invalidServerResponseError: "Sunucudan geçersiz yanıt alındı."
    ,more: "Daha Fazla"
    ,module: "Modül"
    ,accounts: "Hesaplar"
    ,history: "Geçmiş"
    ,colorOrange: "Turuncu"
    ,colorBlue: "Mavi"
    ,colorGreen: "Yeşil"
    ,colorRed: "Kırmızı"
    ,colorPurple: "Mor"
    ,colorYellow: "Sarı"
    ,colorGray: "Gri"
    ,colorBlack: "Siyah"
    ,mfaTitle: "İki Adımlı Doğrulama"
    ,mfaSubtitle: "Authenticator uygulamanızdaki 6 haneli kodu veya kurtarma kodunuzu girin."
    ,mfaSetupTitle: "Authenticator kurulumu"
    ,mfaSetupSubtitle: "QR kodu Authenticator uygulamanızla tarayın, sonra oluşan kodu girin."
    ,mfaCode: "Doğrulama veya kurtarma kodu"
    ,mfaVerify: "Doğrula ve giriş yap"
    ,mfaChooseMethod: "Güvenlik yöntemi seçin"
    ,mfaAuthenticatorMethod: "Authenticator uygulaması"
    ,mfaEmailMethod: "E-posta ile doğrulama"
    ,mfaUseAnotherMethod: "Başka bir yöntem kullan"
    ,mfaResendEmail: "Kodu yeniden gönder"
    ,mfaEmailSent: "Doğrulama kodu {email} adresine gönderildi."
    ,mfaCodeInvalidError: "Doğrulama kodu geçersiz veya süresi dolmuş. Yeni kodu girip tekrar deneyin."
    ,mfaCodeReusedError: "Bu doğrulama kodu daha önce kullanıldı. Yeni kodu bekleyip tekrar deneyin."
    ,mfaChallengeExpiredError: "Giriş doğrulama süresi doldu. Parolanızla yeniden giriş yapın."
    ,mfaRateLimitedError: "Çok fazla doğrulama denemesi yaptınız. Kısa bir süre sonra tekrar deneyin."
    ,authSessionCreateFailedError: "Giriş oturumu oluşturulamadı. Tekrar deneyin."
    ,authMethodUnavailableError: "Doğrulama yöntemi şu anda kullanılamıyor. Tekrar deneyin."
    ,authInternalError: "Giriş işlemi tamamlanamadı. Tekrar deneyin."
    ,mfaRememberDevice: "Bu cihaza 30 gün güven"
    ,mfaManualKey: "Manuel kurulum anahtarı"
    ,mfaShowSecret: "Kurulum anahtarını göster"
    ,mfaHideSecret: "Kurulum anahtarını gizle"
    ,mfaCopySecret: "Kurulum anahtarını kopyala"
    ,mfaRecoveryCodes: "Kurtarma kodları"
    ,mfaRecoveryWarning: "Bu kodları güvenli bir yerde saklayın. Her kod yalnızca bir kez kullanılabilir."
    ,mfaBackToLogin: "Giriş ekranına dön"
    ,security: "Güvenlik"
    ,mfaSecurityDescription: "İki adımlı doğrulamayı, kurtarma kodlarını ve güvenilir cihazları yönetin."
    ,mfaEnabled: "Etkin"
    ,mfaDisabled: "Etkin değil"
    ,mfaPendingVerification: "Doğrulama bekleniyor"
    ,mfaLocked: "Kilitli"
    ,mfaRequiresReverification: "Yeniden doğrulama gerekli"
    ,mfaEnable: "Etkinleştir"
    ,mfaConfirmEnable: "Kurulumu onayla"
    ,mfaDisable: "Devre dışı bırak"
    ,mfaDisableConfirm: "İki adımlı doğrulama kapatılacak ve tüm oturumlarınız sonlandırılacak. Devam edilsin mi?"
    ,mfaEnabledSuccess: "İki adımlı doğrulama etkinleştirildi."
    ,mfaRecoveryRemaining: "Kalan tek kullanımlık kod: {count}"
    ,mfaCopyCodes: "Kodları kopyala"
    ,mfaRecoveryCopied: "Kurtarma kodları kopyalandı ve 60 saniye sonra panodan temizlenecek. Kodları güvenli bir yerde saklayın."
    ,mfaSecretCopied: "Kurulum anahtarı panoya kopyalandı ve 60 saniye sonra temizlenecek."
    ,mfaRegenerate: "Kodları yenile"
    ,mfaActiveSessions: "Aktif oturumlar"
    ,mfaCurrentSession: "Bu oturum"
    ,mfaNoActiveSessions: "Aktif oturum bulunmuyor."
    ,mfaLogoutEverywhere: "Her yerden çıkış yap"
    ,mfaLogoutEverywhereConfirm: "Tüm web ve mobil oturumlarınız kapatılacak. Devam edilsin mi?"
    ,mfaRevokeSessionConfirm: "Bu oturum kapatılacak. Devam edilsin mi?"
    ,mfaTrustedDevices: "Güvenilir cihazlar"
    ,mfaRevokeDeviceConfirm: "Bu cihazın güveni kaldırılacak. Devam edilsin mi?"
    ,mfaUnknownDevice: "Bilinmeyen cihaz"
    ,mfaNoTrustedDevices: "Güvenilir cihaz bulunmuyor."
    ,mfaLoginSecurity: "Giriş güvenliği"
    ,mfaSummaryPasswordOnly: "Yalnızca şifre"
    ,mfaSummaryTotp: "Authenticator etkin"
    ,mfaSummaryEmail: "E-posta doğrulaması etkin"
    ,mfaSummaryBoth: "Authenticator ve e-posta doğrulaması etkin"
    ,mfaPreferredMethod: "Varsayılan yöntem"
    ,mfaPreferredMethodTitle: "Varsayılan doğrulama yöntemi"
    ,mfaPreferredDescription: "Giriş sırasında önce gösterilecek yöntemi seçin. Diğer etkin yönteme her zaman geçebilirsiniz."
    ,mfaPreferredUpdated: "Varsayılan doğrulama yöntemi güncellendi."
    ,mfaDisableMethod: "Devre dışı bırak"
    ,mfaVerificationCode: "Doğrulama kodu"
    ,mfaSendEmailCode: "E-posta kodu gönder"
    ,mfaEmailCodeSent: "Doğrulama kodu e-posta adresinize gönderildi."
    ,mfaEmailEnabledSuccess: "E-posta ile doğrulama etkinleştirildi."
    ,mfaPolicyCompliant: "Hesabınız çalışma alanı güvenlik politikasına uygun."
    ,mfaPolicyActionRequired: "Devam etmek için çalışma alanı politikasının gerektirdiği güvenlik yöntemini etkinleştirin."
    ,verifyEmailTitle: "E-posta adresinizi doğrulayın"
    ,verifyEmailTrialDescription: "7 günlük deneme, ilk başarılı WhatsApp bağlantısı kurulduğu anda otomatik başlar."
    ,resendVerificationEmail: "Doğrulama e-postasını yeniden gönder"
    ,verificationEmailSent: "Doğrulama e-postası gönderildi."
    ,emailAlreadyVerified: "E-posta adresiniz zaten doğrulanmış."
    ,trialReadyTitle: "7 günlük denemeniz hazır"
    ,trialReadyDescription: "Deneme süreniz, WhatsApp hesabınız ilk kez başarıyla bağlandığında başlar."
    ,userSeats: "Hesaplar"
    ,whatsappConnections: "WhatsApp bağlantısı"
    ,trialIneligibleTitle: "Ücretsiz deneme kullanılmış"
    ,trialIdentityUsedDescription: "Bu WhatsApp hesabı daha önce ücretsiz deneme hakkını kullanmıştır. Devam etmek için bir paket seçmeniz gerekir."
    ,trialReviewTitle: "Deneme uygunluğu inceleniyor"
    ,trialReviewDescription: "Güvenlik kontrolleri nedeniyle deneme hakkınız incelemeye alındı. Ücretli paket satın almanıza engel yoktur."
    ,accountsUsed: "{used} / {limit} hesap kullanılıyor"
    ,directUserFieldsRequired: "Ad, soyad, geçerli e-posta ve parola politikasına uygun geçici şifre girin."
    ,firstNameRequiredError: "Ad alanını doldurun."
    ,lastNameRequiredError: "Soyad alanını doldurun."
    ,nameFieldsRequiredError: "Ad ve soyad alanlarını doldurun."
    ,emailNotAvailableError: "Bu e-posta adresi başka bir hesap tarafından kullanılıyor."
    ,userCreated: "Kullanıcı oluşturuldu. Geçici giriş bilgilerini ilgili kullanıcıyla güvenli bir şekilde paylaşın. Kullanıcı ilk girişinde şifresini değiştirmek zorundadır."
    ,userCreateFailed: "Kullanıcı oluşturulamadı."
    ,userReactivated: "Kullanıcı etkinleştirildi."
    ,userSuspended: "Kullanıcı askıya alındı."
    ,temporaryPasswordReset: "Geçici şifre yenilendi. Kullanıcının mevcut oturumları sonlandırıldı."
    ,temporaryPasswordResetFailed: "Geçici şifre yenilenemedi."
    ,directUsersDescription: "Hesabınıza bağlı kullanıcıları ekleyin ve yönetin."
    ,accountUsage: "Hesap kullanımı"
    ,addNewUser: "Yeni Kullanıcı Ekle"
    ,addNewUserDescription: "Yeni kullanıcı için giriş bilgilerini oluşturun."
    ,firstName: "Ad"
    ,lastName: "Soyad"
    ,temporaryPassword: "Geçici Şifre"
    ,createUser: "Kullanıcı Oluştur"
    ,noAvailableAccounts: "Paketinizde kullanılabilir hesap hakkı kalmadı."
    ,resetTemporaryPassword: "Geçici Şifre Oluştur"
    ,saveTemporaryPassword: "Geçici Şifreyi Kaydet"
    ,passwordChangePending: "Şifre Değişikliği Bekliyor"
    ,currentUser: "Mevcut kullanıcı"
    ,reactivateUser: "Etkinleştir"
    ,suspendUser: "Askıya Al"
    ,passwordChangeTitle: "Şifrenizi değiştirin"
    ,passwordChangeDescription: "Güvenliğiniz için geçici şifrenizi ilk girişte değiştirmeniz gerekir."
    ,newPasswordConfirmation: "Yeni Şifre Tekrar"
    ,changePasswordAndContinue: "Şifreyi Değiştir ve Devam Et"
    ,temporaryPasswordInvalid: "Geçici şifre geçersiz."
    ,passwordReuseNotAllowed: "Yeni şifre geçici şifrenizle aynı olamaz."
    ,passwordChangeExpired: "Şifre değiştirme oturumunun süresi doldu. Geçici şifrenizle tekrar giriş yapın."
  },
  en: {
    teamAddUser: "Add User",
    loginTitle: "Welcome back",
    loginSubtitle: "Sign in to your Logivya workspace.",
    or: "Or",
    continueWithGoogle: "Continue with Google",
    continueWithApple: "Continue with Apple",
    socialLoginFailedTitle: "Sign-in failed",
    socialLoginFailed: "Your Google or Apple account could not be verified. Please try again.",
    socialLoginInProgress: "Completing secure sign-in...",
    socialProviderUnavailable: "This sign-in method is currently unavailable. Please try again.",
    socialLoginNotConfigured: "This sign-in method has not been configured yet.",
    socialAccountNotFound: "No active Logivya account matches this email address. Register or sign in to your existing account first.",
    socialPasswordRequired: "This account still requires its first password change. Sign in once with the temporary password.",
    registerTitle: "Create account",
    forgotPasswordTitle: "Reset your password",
    resetPasswordTitle: "Set a new password",
    emailOrPhone: "Email or phone",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    passwordPolicy: "Your password must be at least 8 characters long.",
    passwordRequired: "Password is required.",
    passwordTooShort: "Password must be at least 8 characters long.",
    passwordConfirmationMismatch: "Passwords do not match.",
    passwordInvalidType: "Password must be text.",
    login: "Sign in",
    register: "Register",
    forgotPassword: "Forgot password",
    dashboard: "Dashboard",
    whatsapp: "WhatsApp",
    whatsappAccounts: "WhatsApp Management",
    telegramAccounts: "Telegram Management",
    facebookPages: "Facebook Management",
    accountsTab: "Accounts",
    historyTab: "History",
    telegramAccountsDescription: "Connect Telegram accounts, sync chats, and manage deliveries in one workspace.",
    groups: "Groups",
    whatsAppGroupsMetric: "WhatsApp Groups",
    users: "Users",
    categories: "Categories",
    messaging: "Messaging",
    support: "Support",
    freightMarketplace: "Freight Marketplace",
    createLoad: "Create Load",
    findLoads: "Find Loads",
    myListings: "My Listings",
    createLoadDescription: "Publish your transport requirement and reach suitable carriers.",
    findLoadsDescription: "Find current freight listings by route and transport details.",
    myListingsDescription: "Manage your freight listings and their status.",
    logisticsMarketplace: "Logivya Logistics Marketplace",
    homeMovingMarketplace: "Home Moving",
    partialLoadMarketplace: "Partial Load",
    heavyHaulMarketplace: "Heavy Haul",
    homeMovingMarketplaceDescription: "Publish home and office moving jobs, find suitable carriers, and manage your demands.",
    partialLoadMarketplaceDescription: "Publish partial and groupage loads, find available capacity, and manage matches.",
    heavyHaulMarketplaceDescription: "Publish heavy, oversized, and project cargo and find compatible vehicles and services.",
    facebookPagesMenuDescription: "Connect Facebook Pages, create posts, and manage history.",
    logisticsSector: "Logistics sector",
    logisticsSectorDemandDescription: "Choose the marketplace where this demand should be matched.",
    listingSector: "Listing sector",
    sectorSelectionLocked: "The sector is preserved because you opened this form from its marketplace.",
    showFields: "Show fields",
    hideFields: "Hide",
    advertiser: "Advertiser",
    listingSourceLabel: "Listing source",
    loadingLabel: "LOADING",
    deliveryLabel: "DELIVERY",
    sectorFilter: "Sector",
    generalLogistics: "General Logistics",
    marketplaceDashboardTitle: "Everything transport needs, in one place",
    marketplaceDashboardDescription: "Post a load or an available vehicle, then find the right load, vehicle, or driver quickly and safely.",
    marketplaceSafetyTitle: "Safety and reporting",
    marketplaceSafetyDescription: "Report listings that violate the rules to the Logivya team or block the listing owner.",
    marketplaceSafetyReportSubject: "Marketplace listing report: {title}",
    reportListing: "Report listing",
    reportListingConfirm: "This listing will be sent to Logivya support and moderation for review. Continue?",
    reportSubmittedTitle: "Report received",
    reportSubmittedDescription: "The listing was sent to the moderation team and will be reviewed under the marketplace rules.",
    reportListingFailed: "The listing could not be reported right now. Try again or contact us from Support.",
    blockMarketplaceUser: "Block listing owner",
    blockMarketplaceUserConfirm: "Load, vehicle, and driver listings published by {name} will be hidden for your account on this device. Continue?",
    marketplaceUserBlockedTitle: "Listing owner blocked",
    marketplaceUserBlockedDescription: "This user's marketplace listings will no longer appear in your search results.",
    unblockMarketplaceUser: "Unblock owner",
    marketplaceUserUnblockedTitle: "Owner unblocked",
    marketplaceUserUnblockedDescription: "Eligible listings from this user will appear in your search results again.",
    whatAreYouLookingFor: "What are you looking for?",
    marketplaceSearch: "Search the logistics marketplace",
    marketplaceSearchHint: "Search by city, route, vehicle type, or driver qualification.",
    searchLoadPlaceholder: "e.g. Istanbul to Ankara load",
    searchVehiclePlaceholder: "e.g. Curtainsider in Izmir",
    searchDriverPlaceholder: "e.g. CE driver in Istanbul",
    quickActions: "Quick actions",
    quickActionsDescription: "Choose what you need and get started.",
    load: "Load",
    vehicle: "Vehicle",
    driver: "Driver",
    dashboardCreateLoadDescription: "Publish a listing for cargo that needs transport.",
    dashboardFindLoadsDescription: "Find current loads that match your route.",
    dashboardShareVehicleDescription: "Share the route and availability of an empty vehicle.",
    dashboardFindDriverDescription: "Find drivers or publish a driver listing.",
    dashboardMyListingsDescription: "Manage all load, vehicle, and driver listings.",
    demandCenter: "Request Center",
    createDemandRequest: "Create Request",
    createDemandRequestDashboardDescription: "Get notified immediately when a matching load, vehicle, or driver is published.",
    createDemandRequestDescription: "Define your need once and let Logivya watch the marketplace for suitable listings.",
    myDemandRequests: "My Requests",
    myDemandRequestsDescription: "Manage active watches, matching listings, and request status.",
    demandRequestsLoadFailed: "Requests could not be loaded.",
    demandRequestUpdateFailed: "The request status could not be updated.",
    demandRequestCreateFailed: "The request could not be created.",
    demandRequestCreatedTitle: "Your request is active",
    demandRequestCreatedDescription: "We will notify you when a suitable new listing is published.",
    demandRequestUpdatedTitle: "Your request was updated",
    demandRequestUpdatedDescription: "The new criteria were saved and matching will continue with the latest details.",
    demandRequestCreatedWithMatches: "Your request is active and {count} suitable listings have already been found.",
    smartMatchingStartedDescription: "Your request was saved. Smart Matching is running in the background and will continue after you leave this screen.",
    smartMatchingTitle: "Smart Matching",
    smartMatchingStatusQUEUED: "Search queued",
    smartMatchingStatusRUNNING: "Searching for suitable results",
    smartMatchingStatusPARTIAL: "Search partially completed",
    smartMatchingStatusCOMPLETED: "Search completed",
    smartMatchingStatusFAILED: "Search could not be completed",
    smartMatchingStatusCANCELLED: "Search cancelled",
    smartMatchingProgressCounts: "{groups} groups · {messages} messages · {matches} results",
    matchSourceLOGIVYA: "Logivya",
    matchSourceWHATSAPP: "WhatsApp",
    matchSourceTELEGRAM: "Telegram",
    foundInMultipleSources: "Found in {count} sources",
    saveMatch: "Save",
    dismissMatch: "Dismiss",
    demandMatchStatusUpdateFailed: "The result status could not be updated.",
    contactOnTelegram: "Contact on Telegram",
    noDemandRequests: "No requests yet",
    noDemandRequestsDescription: "Save a load, vehicle, or driver need to start automatic matching.",
    whatDoYouNeed: "What do you need?",
    demandKindDescription: "Choose the type of listing you want to watch.",
    demandRequestTitle: "Request name",
    demandRequestTitlePlaceholder: "Example: Istanbul–Ankara curtainsider vehicle",
    demandKeywordsOptional: "Keywords (optional)",
    demandKeywordsPlaceholder: "Separate with commas: refrigerated, partial",
    routeAndCapacity: "Route and capacity",
    routeAndCapacityDescription: "Enter only important criteria; blank fields remain flexible.",
    demandVehicleCategoryOptional: "Vehicle category (optional)",
    demandVehicleBodyLengthOptional: "Body length in metres (optional)",
    demandVehicleBodyLengthInvalid: "Body length must be a valid number between 0 and 40 metres.",
    demandRequiredPlateCountryOptional: "Required plate country (optional)",
    demandTransitRouteOptional: "Transit route (optional)",
    fromOptional: "From (optional)",
    cityOrRegion: "City or region",
    freightTrailerTypeOptional: "Vehicle type (optional)",
    allTrailerTypes: "All vehicle types",
    clearTrailerSelection: "Clear vehicle type",
    minimumWeightOptional: "Minimum tonnes (optional)",
    maximumWeightOptional: "Maximum tonnes (optional)",
    internationalTransportRequired: "International transport required",
    internationalTransportRequiredDescription: "Only vehicles available for international transport will match.",
    adrRequired: "ADR required",
    adrRequiredDescription: "Only ADR-suitable vehicles will match.",
    driverCriteria: "Driver criteria",
    driverCriteriaDescription: "Choose the location, licence, and work type you need.",
    driverLocationOptional: "Driver location (optional)",
    matchingDriverListingType: "Listing type to match",
    driverLicenseClassesOptional: "Licence classes (optional)",
    driverEmploymentTypeOptional: "Employment type (optional)",
    clearEmploymentSelection: "Clear employment type",
    internationalExperienceRequired: "International experience required",
    internationalExperienceRequiredDescription: "Only drivers with international experience will match.",
    driverAdrRequiredDescription: "Only drivers with an ADR certificate will match.",
    demandDateRange: "Availability period",
    demandDateRangeDescription: "Set the date range the listing should cover.",
    availableFromOptional: "Starts (optional)",
    anyDate: "Any date",
    clearDate: "Clear date",
    done: "Done",
    demandExpiryNotice: "The request remains active for 30 days. You can pause or complete it at any time.",
    activateDemandRequest: "Activate request",
    demandRequestTitleRequired: "Enter a descriptive request name of at least 3 characters.",
    demandRequestCriteriaRequired: "Select at least one matching criterion so notifications stay relevant.",
    demandKindLOAD: "Load request",
    demandKindVEHICLE: "Vehicle request",
    demandKindDRIVER: "Driver request",
    demandStatusACTIVE: "Active",
    demandStatusPAUSED: "Paused",
    demandStatusFULFILLED: "Completed",
    demandStatusEXPIRED: "Expired",
    matchingListings: "Matching listings",
    viewMatches: "View matches",
    pauseDemand: "Pause",
    reactivateDemand: "Reactivate",
    completeDemand: "Complete",
    demandMatchesLoadFailed: "Matching listings could not be loaded.",
    demandMatchesDescription: "Listings matching your request criteria are shown here, starting with the strongest match.",
    noDemandMatches: "No matching listing yet",
    noDemandMatchesDescription: "You will receive an in-app and device notification when a suitable new listing is published.",
    matchScore: "{count}% match",
    vehicleMarketplace: "Vehicle Marketplace",
    driverMarketplace: "Driver Marketplace",
    shareVehicle: "Share Vehicle",
    findVehicle: "Find Vehicle",
    findAndShareVehicle: "Find - Share Vehicle",
    findDriver: "Find Driver",
    liveListings: "Live listings",
    liveListingsDescription: "New logistics listings appear here automatically.",
    recentMatches: "Recent matches",
    recentMatchesDescription: "The latest listings matching your active demands.",
    demandNotifications: "Notifications for this demand",
    demandNotificationsDescription: "Receive in-app and push notifications when a new listing matches.",
    deleteDemand: "Delete demand",
    deleteDemandConfirm: "Do you want to permanently delete this demand and its match history?",
    noLiveListings: "No live listings yet",
    noRecentMatches: "No matches yet",
    listingSource: "Listing source: {source}",
    findVehicleDescription: "Find available vehicles by location, route, and vehicle type.",
    shareVehicleDescription: "Publish your available vehicle and preferred route to reach shippers.",
    findDriverDescription: "Find available drivers or current driver job listings.",
    postDriverListing: "Post Driver Listing",
    postDriverListingDescription: "Safely publish that you need a driver or are available for work.",
    vehicleRouteAvailability: "Location and availability",
    vehicleCurrentLocation: "Current vehicle location",
    vehiclePreferredDestinationOptional: "Preferred destination (optional)",
    availableFrom: "Available from",
    availableUntilOptional: "Available until (optional)",
    marketplaceDateRangeInvalid: "The availability end cannot be before the start.",
    vehicleCapacityFeatures: "Vehicle capacity and features",
    vehicleCapacityTonnesOptional: "Capacity (tonnes, optional)",
    internationalTransport: "Available for international transport",
    internationalTransportDescription: "The vehicle can operate on international routes.",
    adrSuitable: "ADR suitable",
    adrSuitableDescription: "The vehicle is equipped for dangerous goods transport.",
    vehiclePriceOptional: "Requested rate (optional)",
    publishVehicle: "Publish vehicle",
    vehiclePublishedTitle: "Vehicle listing published",
    vehiclePublishedDescription: "Your vehicle is now live in the Vehicle Marketplace.",
    vehicleCreateFailed: "The vehicle listing could not be created.",
    vehicleSearchFailed: "Vehicle listings could not be loaded.",
    vehicleDetailFailed: "Vehicle listing details could not be loaded.",
    vehicleUpdateFailed: "The vehicle listing could not be updated.",
    vehicleUpdated: "Vehicle listing changes were saved.",
    availableVehicles: "Available vehicles",
    noVehiclesFound: "No matching vehicles found",
    noVehiclesFoundDescription: "Change the location or vehicle type filters and try again.",
    vehicleListing: "Vehicle listing",
    editVehicleListing: "Edit vehicle listing",
    editVehicleListingDescription: "Update the vehicle route, availability, and contact information.",
    toOptional: "To (optional)",
    priceOnRequest: "Rate negotiable",
    capacityFlexible: "Capacity negotiable",
    tonnesCount: "{count} tonnes",
    vehiclesCount: "{count} vehicles",
    contactByPhone: "Contact by phone",
    contactUnavailable: "Contact information is currently unavailable.",
    description: "Description",
    driverListingPurpose: "Listing purpose",
    driverWanted: "Driver wanted",
    driverAvailable: "Driver available",
    driverWantedDescription: "Publish the qualifications you need for your company.",
    driverAvailableDescription: "Publish your driver experience and preferred working conditions.",
    driverBasicInformation: "Basic information",
    driverListingTitle: "Listing title",
    driverLocation: "Location",
    preferredRouteOptional: "Preferred route (optional)",
    preferredRoute: "Preferred route",
    driverQualifications: "Licence, experience, and certificates",
    driverLicenseClasses: "Licence classes",
    driverLicenseClass: "Licence class",
    allLicenseClasses: "All licence classes",
    driverExperienceYears: "Experience (years)",
    yearsExperience: "{count} years of experience",
    driverEmploymentType: "Employment type",
    allEmploymentTypes: "All employment types",
    driverEmploymentFULL_TIME: "Full time",
    driverEmploymentPART_TIME: "Part time",
    driverEmploymentCONTRACT: "Contract",
    driverEmploymentDAILY: "Daily / per trip",
    internationalExperience: "International experience",
    driverSrcCertificate: "SRC certificate",
    driverPsychotechnicalCertificate: "Psychotechnical certificate",
    driverAdrCertificate: "ADR certificate",
    driverSalaryOptional: "Rate / salary (optional)",
    salaryOnRequest: "Rate negotiable",
    driverTitleRequired: "Enter a listing title with at least 3 characters.",
    driverLocationRequired: "Enter a valid location.",
    driverLicenseRequired: "Select at least one licence class.",
    driverExperienceInvalid: "Experience must be between 0 and 60 years.",
    publishDriverListing: "Publish driver listing",
    driverPublishedTitle: "Driver listing published",
    driverPublishedDescription: "Your listing is now live in the Driver Marketplace.",
    driverCreateFailed: "The driver listing could not be created.",
    driverSearchFailed: "Driver listings could not be loaded.",
    driverDetailFailed: "Driver listing details could not be loaded.",
    driverUpdateFailed: "The driver listing could not be updated.",
    driverUpdated: "Driver listing changes were saved.",
    driverListing: "Driver listing",
    editDriverListing: "Edit driver listing",
    editDriverListingDescription: "Update listing location, qualifications, and contact information.",
    availableDrivers: "Available drivers",
    driverJobListings: "Driver job listings",
    noDriversFound: "No matching driver listings found",
    noDriversFoundDescription: "Change location or qualification filters and try again.",
    myListingsUnifiedDescription: "Edit load, vehicle, and driver listings and manage their status in one place.",
    listingType: "Listing type",
    status: "Status",
    noListingsInThisSection: "No listings in this section",
    noListingsInThisSectionDescription: "Create a new listing or choose another type and status.",
    saved: "Saved",
    ok: "OK",
    loading: "Loading",
    freightRouteSection: "Route and date",
    freightOrigin: "Loading location",
    freightDestination: "Delivery location",
    freightLoadingDate: "Loading date",
    freightLoadSection: "Load and vehicle details",
    freightWeightTonnes: "Weight (tonnes)",
    freightTrailerType: "Trailer / vehicle type",
    freightSelectTrailer: "Select a trailer or vehicle type",
    freightVehicleCount: "Vehicle count",
    freightCargoTypeOptional: "Cargo type (optional)",
    freightContainerStatus: "Container status",
    freightCommercialSection: "Price and contact",
    freightPriceOptional: "Price (optional)",
    freightCurrency: "Currency",
    freightCustomsOptional: "Customs information (optional)",
    freightContactPhone: "Contact phone",
    freightDescriptionOptional: "Description (optional)",
    publishLoad: "Publish load",
    freightOriginRequired: "Enter a valid loading location.",
    freightDestinationRequired: "Enter a valid delivery location.",
    freightDateRequired: "Select a valid loading date.",
    freightDatePast: "The loading date cannot be in the past.",
    freightWeightInvalid: "Weight must be between 0 and 200 tonnes.",
    freightTrailerRequired: "Select a trailer or vehicle type.",
    freightVehicleCountInvalid: "Vehicle count must be between 1 and 100.",
    freightPriceInvalid: "Price must be greater than zero.",
    freightCurrencyRequired: "Select a currency when a price is entered.",
    freightPhoneRequired: "Enter a valid contact phone number.",
    freightTrailerCurtainsider: "Curtainsider",
    freightTrailerOpen: "Open trailer",
    freightTrailerClosed: "Closed trailer",
    freightTrailerRefrigerated: "Refrigerated",
    freightTrailerContainer: "Container carrier",
    freightTrailerLowbed: "Lowbed",
    freightTrailerTruck: "Truck",
    freightTrailerVan: "Van",
    freightTrailerOther: "Other",
    freightContainerNone: "No container",
    freightContainerOneWay: "One way",
    freightContainerReturn: "Return required",
    freightStatusActive: "Active",
    freightStatusCompleted: "Completed",
    freightStatusInactive: "Inactive",
    freightStatusExpired: "Expired",
    freightWeightValue: "{weight} tonnes",
    freightVehicleCountValue: "{count} vehicles",
    freightPriceNotSpecified: "Price not specified",
    viewDetails: "View details",
    freightPublishedTitle: "Freight listing published",
    freightPublishedDescription: "Your listing is now live in the Freight Marketplace.",
    viewMyListings: "View my listings",
    freightCreateFailed: "The freight listing could not be created.",
    from: "From",
    to: "To",
    freightAllTrailerTypes: "All trailer and vehicle types",
    freightLoadingDateOptional: "Loading date (optional)",
    freightAnyDate: "Any date",
    clear: "Clear",
    freightMinimumWeight: "Minimum weight (tonnes)",
    freightMaximumWeight: "Maximum weight (tonnes)",
    freightWeightRangeInvalid: "Minimum weight cannot exceed maximum weight.",
    freightAvailableLoads: "Available loads",
    freightSearchFailed: "Freight listings could not be loaded.",
    freightLoadingListings: "Preparing freight listings",
    freightNoLoads: "No matching loads found",
    freightNoLoadsDescription: "Change the filters and try your search again.",
    freightLoadDetails: "Freight listing details",
    freightLoadingDetails: "Preparing listing details",
    back: "Go back",
    freightCargoType: "Cargo type",
    freightPrice: "Price",
    freightCustoms: "Customs information",
    freightListingOwner: "Listing owner",
    freightPublishedAt: "Published at",
    notSpecified: "Not specified",
    freightDescription: "Description",
    freightContactTitle: "Contact listing owner",
    freightContactConfirmation: "Would you like to call the listing owner at {phone} now?",
    call: "Call",
    contact: "Contact",
    editListing: "Edit listing",
    freightDetailsFailed: "Listing details could not be loaded.",
    freightMyListingsFailed: "Your listings could not be loaded.",
    markCompleted: "Mark as completed",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    freightStatusConfirmation: "Are you sure you want to change this listing's status?",
    freightStatusUpdateFailed: "Listing status could not be updated.",
    freightNotEditable: "A completed listing cannot be edited.",
    freightStatusTransitionInvalid: "The selected status change is not allowed for this listing.",
    freightNoMyListings: "No listings with this status",
    freightNoMyListingsDescription: "Create a new freight listing or view another status.",
    freightUpdatedTitle: "Listing updated",
    freightUpdatedDescription: "Your freight listing changes were saved.",
    freightUpdateFailed: "The freight listing could not be updated.",
    editListingDescription: "Update your freight listing's transport and contact details.",
    profile: "Profile",
    placeholder: "This screen is ready for mobile workflows.",
    connectedAccounts: "Connected WhatsApp Accounts",
    sentThisMonth: "Sent This Month",
    failedMessages: "Failed Messages",
    currentPlan: "Current Plan",
    remainingDays: "Remaining days",
    activePlan: "Active Plan",
    trialPlan: "Trial Plan",
    expiredPlan: "Plan expired",
    suspendedPlan: "Plan suspended",
    cancelledPlan: "Plan cancelled",
    retry: "Retry",
    refresh: "Refresh",
    manageWhatsAppAccounts: "Manage WhatsApp Accounts",
    noWhatsAppAccountFound: "No WhatsApp account found",
    connectAccount: "Connect account",
    addWhatsAppAccount: "Add WhatsApp account",
    connectWithQr: "Connect with QR",
    connectWithPhoneCode: "Connect with phone code",
    connect: "Connect",
    reconnect: "Reconnect",
    archive: "Archive",
    delete: "Delete",
    cancel: "Cancel",
    confirm: "Confirm",
    edit: "Edit",
    statusConnected: "Connected",
    statusNotConnected: "Disconnected",
    statusConnecting: "Connecting",
    statusWaitingQr: "Waiting for QR",
    statusWaitingPhone: "Waiting for Phone Code",
    statusFailed: "Disconnected",
    statusDisconnected: "Disconnected",
    statusReconnectRequired: "Reconnect",
    statusArchived: "Archived",
    whatsappMessageChecking: "Checking connection",
    whatsappMessageReconnecting: "Trying to reconnect",
    whatsappMessageConnectionFailed: "WhatsApp connection was temporarily interrupted",
    whatsappMessageReconnect: "Try reconnecting",
    whatsappMessageAuthRequired: "You need to reconnect your WhatsApp account",
    whatsappMessageLoggedOut: "WhatsApp session was logged out",
    loadingDashboard: "Preparing dashboard",
    loadingWhatsApp: "Loading WhatsApp accounts",
    emptyDashboard: "There is no data to show yet.",
    accountActionsPrepared: "Securely connect your WhatsApp account with QR or phone code.",
    lastSync: "Last sync",
    contacts: "Contacts",
    phone: "Phone",
    connectedGroups: "Connected groups",
    connectionState: "Connection state",
    unknown: "Unknown",
    generateQr: "Generate QR code",
    refreshQr: "Refresh QR code",
    qrInstructions: "Open WhatsApp, go to Linked Devices, then scan this QR code.",
    qrGenerating: "Generating QR code",
    qrWaiting: "Waiting for QR scan",
    qrExpired: "QR code expired. A new QR code will be requested automatically.",
    connectionSuccess: "Connection successful",
    returningToAccounts: "Returning to account list",
    country: "Country",
    countryTurkey: "Turkey",
    countryCode: "Country code",
    phoneNumber: "Phone number",
    phonePlaceholder: "Enter your phone number",
    generatePhoneCode: "Generate phone code",
    newCode: "Get new code",
    pairingCode: "Pairing code",
    phoneCodeInstructions: "Enter this code in WhatsApp > Linked Devices > Link with phone number.",
    normalizedPhone: "Normalized phone",
    pollingConnection: "Checking connection",
    actionFailed: "Action could not be completed.",
    deleteConfirmation: "Are you sure you want to delete this WhatsApp account?",
    archiveConfirmation: "Are you sure you want to archive this WhatsApp account?",
    reconnectConfirmation: "Start reconnection for this WhatsApp account?",
    loadingGroups: "Loading groups",
    groupsEyebrow: "WhatsApp Groups",
    groupsTitle: "Manage groups",
    groupsSubtitle: "Search, filter, and monitor category status for groups synced from connected WhatsApp accounts.",
    searchGroups: "Search groups",
    searchGroupsPlaceholder: "Type a group name...",
    filterByAccount: "Filter by account",
    filterByCategory: "Filter by category",
    allAccounts: "All accounts",
    allCategories: "All categories",
    clearFilters: "Clear filters",
    noGroupsFound: "No groups found",
    noGroupsFoundDescription: "Try changing your search or filters.",
    sendable: "Sendable",
    notSendable: "Not sendable",
    members: "Members",
    loadingCategories: "Loading categories",
    categoriesEyebrow: "Category Management",
    categoriesTitle: "Categories",
    categoriesSubtitle: "Create, edit, and assign groups to categories for targeted messaging.",
    createCategory: "Create category",
    editCategory: "Edit category",
    deleteCategory: "Delete category",
    deleteCategoryConfirmation: "Are you sure you want to delete this category?",
    categoryName: "Category name",
    categoryDescription: "Description",
    categoryColor: "Select color",
    changeCategoryColor: "Change color",
    selectedCategoryColor: "Selected color",
    categoryColorOptions: "Preset colors",
    categoryNameValidation: "Category name must be at least 2 characters.",
    categoryColorValidation: "Color must use #f97316 format.",
    saveChanges: "Save changes",
    noCategoriesFound: "No categories found",
    noCategoriesFoundDescription: "Create your first category to organize groups.",
    assignedGroups: "Assigned groups",
    categoryDetail: "Category detail",
    categoryNotFound: "Category not found",
    noAssignedGroups: "No assigned groups",
    noAssignedGroupsDescription: "You can add groups to this category from the list below.",
    assignGroups: "Assign groups",
    saveAssignments: "Save assignments",
    loadingSupport: "Loading support tickets",
    supportCenter: "Support Center",
    supportTickets: "Support Tickets",
    supportSubtitle: "Contact the team, track existing tickets, and follow conversations.",
    createTicket: "Create support ticket",
    ticketDetail: "Ticket detail",
    noTicketsFound: "No support tickets",
    noTicketsFoundDescription: "Create a new ticket to get help from the Logivya team.",
    supportOpen: "Open",
    supportPending: "Pending",
    supportInProgress: "In progress",
    supportAnswered: "Answered",
    supportResolved: "Resolved",
    supportClosed: "Closed",
    createTicketSubtitle: "Enter a subject, category, and description to open a support ticket.",
    ticketSubject: "Subject",
    ticketCategory: "Category",
    ticketDescription: "Description",
    supportValidation: "Subject must be at least 3 characters and description at least 5 characters.",
    ticketTechnical: "Technical",
    ticketBilling: "Billing",
    ticketSubscription: "Subscription",
    ticketWhatsapp: "WhatsApp",
    search: "Search",
    all: "All",
    priority: "Priority",
    internalNote: "Internal note",
    updatePriority: "Update priority",
    supportWaitingForUser: "Waiting for user",
    supportWaitingForAdmin: "Waiting for support",
    ticketMessageDelivery: "Message delivery",
    ticketDeleteForEveryone: "Delete for everyone",
    ticketAccount: "Account",
    ticketTeam: "Team",
    ticketSecurity: "Security",
    ticketFeatureRequest: "Feature request",
    unreadReplies: "Unread replies",
    loadMore: "Load more",
    loadOlderMessages: "Load older messages",
    ticketNumber: "Ticket number",
    ticketOther: "Other",
    reply: "Reply",
    sendReply: "Send reply",
    logout: "Logout",
    logoutCompleted: "Session closed.",
    unknownUser: "Logivya User",
    phoneNotSet: "Phone not set",
    unknownRole: "Role unknown",
    company: "Workspace",
    companySettings: "Profile Information",
    companySettingsDescription: "Manage your profile and contact information.",
    subscription: "Subscription",
    subscriptionDescription: "View plan, trial status, and subscription status.",
    notifications: "Notifications",
    notificationsDescription: "Track support, subscription, WhatsApp, and campaign notifications.",
    notificationPreferences: "Notification preferences",
    notificationPreferencesDescription: "Choose the channels you want to use for each notification category.",
    notificationPreferencesSaved: "Your notification preferences were saved.",
    notificationPreferencesSaveFailed: "Notification preferences could not be saved.",
    notificationChannelInApp: "In app",
    notificationChannelEmail: "Email",
    notificationChannelAndroid: "Android push",
    notificationChannelIos: "iOS push",
    notificationChannelWeb: "Web push",
    notificationMandatory: "Required notification",
    notificationCategoryAccount: "Account",
    notificationCategorySecurity: "Security",
    notificationCategorySupport: "Support",
    notificationCategorySubscription: "Subscription",
    notificationCategoryBilling: "Billing",
    notificationCategoryInvitation: "Invitations",
    notificationCategoryWhatsapp: "WhatsApp",
    notificationCategoryMessage: "Messages",
    notificationCategoryMarketplace: "Logistics marketplace",
    notificationCategorySystem: "System",
    notificationCategoryMarketing: "Marketing",
    notificationCategoryCompliance: "Compliance",
    notificationCategoryAdministration: "Administration",
    notificationCategoryBackup: "Backups",
    notificationCategoryIncident: "Incidents",
    savePreferences: "Save preferences",
    notificationDeliveryMode: "Delivery mode",
    notificationImmediate: "Immediate",
    notificationDailyDigest: "Daily",
    notificationWeeklyDigest: "Weekly",
    notificationQuietStart: "Quiet hours start",
    notificationQuietEnd: "Quiet hours end",
    notificationPermissionTitle: "Android notification permission",
    notificationPermissionDescription: "Manage notification permission and device registration.",
    notificationPermissionEducation: "Allow Android notifications to receive WhatsApp connection, support reply, security, and subscription updates on time.",
    notificationPermissionEnable: "Enable notifications",
    notificationPermissionEnabled: "Notifications enabled",
    notificationPermissionDisabled: "Notifications disabled",
    notificationPermissionDenied: "Notification permission was not granted. You can enable it in Android settings.",
    loadingNotifications: "Loading notifications",
    loadingMessageHistory: "Loading message history",
    notificationsLoadFailed: "Notifications could not be loaded",
    noNotificationsDescriptionReady: "Support, subscription, WhatsApp, and campaign notifications will appear here.",
    feedback: "Feedback",
    feedbackMenuDescription: "Report bugs, suggest features, and share your experience directly with our team.",
    closedBeta: "Help us improve",
    feedbackTitle: "Logivya feedback",
    feedbackDescription: "Send issues and improvement ideas directly to the Logivya team.",
    reportBug: "Report bug",
    suggestFeature: "Suggest feature",
    feedbackSubject: "Subject",
    feedbackSubjectPlaceholder: "Write a short title",
    feedbackMessage: "Description",
    feedbackMessagePlaceholder: "What happened, which screen, and how can we reproduce it?",
    screenshotUrl: "Screenshot URL",
    deviceInformation: "Device information",
    appVersion: "App version",
    sendFeedback: "Send feedback",
    feedbackValidation: "Subject must be at least 3 characters and description at least 10 characters.",
    feedbackSent: "Feedback received",
    feedbackSentDescription: "Thank you. The Logivya team will review your feedback.",
    feedbackFailed: "Feedback could not be sent",
    releaseChannel: "Release channel",
    settings: "Settings",
    settingsDescription: "Manage language, theme, security, and session preferences.",
    onboardingEyebrow: "Getting started",
    onboardingTitle: "Discover Logivya in a few steps",
    onboardingSubtitle: "Connect your WhatsApp accounts, organize groups, and manage communication workflows securely.",
    onboardingControlTitle: "You are in control",
    onboardingControlDescription: "Personalize notifications, protect your account, and send feedback from the app.",
    onboardingSkip: "Skip",
    onboardingStart: "Start using Logivya",
    onboardingReplay: "Getting started guide",
    onboardingReplayDescription: "View the short guide to Logivya's core features again.",
    profileEditing: "Profile editing",
    profileEditingApiMissing: "Profile update and password change mobile APIs are not available yet. This screen safely displays current account data.",
    companyName: "Full Name",
    companyPhone: "Phone",
    companyAddress: "Address",
    taxOffice: "Tax Office",
    taxNumber: "Tax Number",
    city: "City",
    district: "District",
    postalCode: "Postal Code",
    address: "Address",
    save: "Save",
    saving: "Saving",
    savedSuccessfully: "Profile information saved.",
    saveFailed: "Profile information could not be saved. Please try again.",
    requiredField: "Please complete the required fields.",
    invalidEmail: "Enter a valid email address.",
    loadingCompanyProfile: "Loading profile information",
    companyProfileLoadFailed: "Profile information could not be loaded. Please try again.",
    companyNamePlaceholder: "Enter full name",
    companyEmailPlaceholder: "Enter email address",
    companyPhonePlaceholder: "Enter phone number",
    companyAddressPlaceholder: "Enter address",
    taxOfficePlaceholder: "Enter tax office",
    taxNumberPlaceholder: "Enter tax number",
    cityPlaceholder: "Enter city",
    districtPlaceholder: "Enter district",
    countryPlaceholder: "Enter country",
    postalCodePlaceholder: "Enter postal code",
    notProvided: "Not provided",
    loadingSubscription: "Loading subscription",
    startDate: "Start date",
    endDate: "End date",
    upgradePlan: "Upgrade plan",
    subscriptionTrial: "Trial",
    subscriptionActive: "Active",
    subscriptionExpired: "Expired",
    subscriptionSuspended: "Suspended",
    subscriptionCancelled: "Cancelled",
    unreadNotifications: "Unread notifications",
    markAllAsRead: "Mark all as read",
    noNotifications: "No notifications",
    noNotificationsDescription: "Support, subscription, WhatsApp, and campaign notifications will appear here when the notification listing API is added.",
    language: "Language",
    theme: "Theme",
    lightTheme: "Light",
    darkTheme: "Dark",
    systemTheme: "System",
    biometricReady: "Biometric-ready sign in",
    about: "About",
    accountSection: "Account",
    deleteAccount: "Delete account",
    deleteAccountDescription: "Create an account closure and data deletion request.",
    privacyData: "Privacy and data",
    privacyDataDescription: "Manage privacy preferences and data requests.",
    privacyControls: "Privacy controls",
    privacyPreferences: "Optional data use",
    privacyPreferencesDescription: "Required service processing cannot be disabled. You can change optional uses at any time.",
    privacyAnalytics: "Product analytics",
    privacyAnalyticsDescription: "Share optional usage measurements to help improve the product.",
    privacyDiagnostics: "Diagnostic data",
    privacyDiagnosticsDescription: "Optionally share crash, startup, network, and screen performance data to help us resolve technical issues.",
    privacyMarketing: "Marketing communications",
    privacyMarketingDescription: "Receive optional campaign and product announcements.",
    privacyPreferenceFailed: "The privacy preference could not be saved.",
    privacyExportTitle: "Export my data",
    privacyExportDescription: "Prepare an encrypted copy of eligible data associated with your account.",
    privacyRequestExport: "Request data export",
    privacyExportQueued: "The encrypted export has been queued for preparation.",
    privacyExportFailed: "The export could not be completed.",
    privacyExportTokenMissing: "The one-time download key for this export is not available on this device.",
    privacyRightsRequest: "Data rights request",
    privacyRequestACCESS: "Access",
    privacyRequestRECTIFICATION: "Rectification",
    privacyRequestRESTRICTION: "Restriction",
    privacyRequestOBJECTION: "Objection",
    privacyRequestOTHER: "Other",
    privacyRequestDescription: "Describe your request and any details needed for verification.",
    privacySubmitRequest: "Submit request",
    privacyRequestReceived: "Your data request has been received.",
    privacyRequestFailed: "The data request could not be submitted.",
    privacyRequestHistory: "Request history",
    currentPassword: "Current password",
    download: "Download",
    accountDeletionPhrase: "DELETE MY LOGIVYA ACCOUNT",
    companyDeletionPhrase: "DELETE MY LOGIVYA WORKSPACE",
    userAccountScope: "My user account only",
    companyAccountScope: "Workspace and associated data",
    deletionQueuedDescription: "Your deletion request has been queued for verification and retention checks.",
    deletionCanceledDescription: "The deletion request was canceled.",
    submitDeletionRequest: "Create deletion request",
    cancelRequest: "Cancel request",
    appTagline: "Manage all communication channels and workflows from one platform",
    close: "Close",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleTheme: "Change theme",
    changeLanguage: "Change language",
    continue: "Continue",
    operationFailed: "Action could not be completed",
    tryAgain: "Please try again.",
    appRestartRequired: "Logivya needs to restart",
    unexpectedError: "An unexpected error occurred. Please try again.",
    appPreparing: "Preparing Logivya...",
    audienceLoadFailed: "Audience list could not be loaded.",
    contactsLoadFailed: "Contacts could not be loaded.",
    contactsRefreshFailed: "Contacts could not be refreshed.",
    selectedGroupsAndContacts: "Selected groups and contacts",
    selectedGroupsOnly: "Selected groups",
    selectedContactsOnly: "Selected contacts",
    noTargetSelected: "No target selected",
    targetSummary: "{count} targets ({groups} groups, {contacts} contacts)",
    targetPrompt: "Select a category, group, or contact",
    messageRequired: "Message cannot be empty.",
    audienceRequired: "Select at least one category, group, or contact.",
    scheduleRequired: "Select a date and time.",
    schedulePast: "The selected date and time cannot be in the past.",
    actionSuccess: "Action completed",
    messageScheduled: "Message scheduled for {count} targets",
    messageQueued: "Message queued for {count} targets",
    messageSendFailed: "Message could not be sent.",
    loadingAudiences: "Loading audiences",
    campaignStudio: "Campaign Studio",
    messagingTitle: "Send Message",
    messagingSubtitle: "Select categories, groups, and permitted contacts, then add the message to the secure delivery queue.",
    selectedTarget: "Selected targets",
    sendableGroup: "Sendable groups",
    selectedContact: "Selected contacts",
    writeMessage: "Write your message",
    messagePlaceholder: "Write your message or attachment caption...",
    addAttachment: "Add attachment",
    photo: "Photo",
    video: "Video",
    document: "Document",
    removeAttachment: "Remove attachment",
    attachmentHelp: "Attach a photo, video, or document and send your text with it as a caption in the same message.",
    attachmentTooLarge: "The file exceeds the platform limit.",
    photoAttachmentTooLarge: "The photo exceeds the platform limit.",
    whatsAppAttachmentHelp: "Mix up to 30 photos, videos, and documents in one send. Each file can be up to 100 MB.",
    telegramAttachmentHelp: "Mix up to 30 photos, videos, and documents in one send. Each file can be up to 2 GB.",
    whatsAppAttachmentTooLarge: "Each WhatsApp file can be up to 100 MB.",
    telegramAttachmentTooLarge: "Each Telegram file can be up to 2 GB.",
    attachmentCountTooLarge: "You can select up to {{max}} files per send.",
    selectedAttachmentCount: "{{count}} files selected",
    removeAllAttachments: "Remove all",
    attachmentPickFailed: "The file could not be selected.",
    attachmentUploadFailed: "The file could not be uploaded.",
    attachmentUploadCanceled: "The file upload was canceled.",
    attachmentUploading: "Uploading: {{completed}}/{{total}}",
    cancelAttachmentUpload: "Cancel upload",
    retryAttachmentUpload: "Retry upload",
    sendNow: "Send now",
    scheduleAction: "Schedule",
    repeatAction: "Repeat",
    selectDateTime: "Select date and time",
    select: "Select",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    intervalPlaceholder: "Interval: 1",
    targetLabel: "Target: {value}",
    contentLabel: "Content: {value}",
    scheduleMessage: "Schedule Message",
    createRecurringDelivery: "Create recurring delivery",
    sendMessage: "Send message",
    selectAudiences: "Select audiences",
    searchAudience: "Search categories or groups...",
    noCategories: "No categories yet.",
    selectVisible: "Select visible",
    peopleCount: "{count} people",
    noSendableGroups: "No sendable groups",
    groupsResyncing: "The connection is healthy; the group list is being synchronized again.",
    connectOrSyncGroups: "Connect your WhatsApp account or synchronize groups.",
    refreshContacts: "Refresh contacts",
    professionalContactsRequired: "An active subscription is required for contact messaging.",
    searchContacts: "Search contacts",
    selectAllContacts: "Select all contacts",
    selectingAllContacts: "Selecting all contacts...",
    selectVisibleContacts: "Select visible contacts",
    selectedCount: "{count} selected",
    contactsLoading: "Loading contacts...",
    noContactsInAccount: "No contacts were found in this WhatsApp account",
    noContactsInAccountDescription: "Refresh contacts or check address book synchronization for the connected WhatsApp account.",
    loadMoreContacts: "Load more contacts",
    messagingCompliance: "Send only to recipients who are awaiting a message or have consented to communication.",
    noAssignedAudience: "No targets assigned yet",
    recurringIntervalValidation: "The repeat interval must be between 1 and 365.",
    reporting: "Reporting",
    messageHistoryTitle: "Message History",
    messageHistorySubtitle: "Track sent, scheduled, and completed campaigns.",
    sent: "Sent",
    scheduled: "Scheduled",
    failed: "Failed",
    noCampaigns: "No campaigns yet",
    noCampaignsDescription: "Campaign records will appear here after you send or schedule a message.",
    deleteForMe: "Delete for me",
    deleteForMeDescription: "This record will be removed only from your message history.",
    deleteForEveryone: "Delete for everyone",
    deleteForEveryoneDescription: "Messages sent to WhatsApp groups will be deleted for everyone when they are within the supported time window.",
    deleteFromPlatform: "Delete from platform",
    deleteFromPlatformDescription: "This campaign will be removed from Logivya history. It will not delete messages from WhatsApp groups.",
    mobileCampaign: "Mobile campaign",
    scheduledAt: "Scheduled: {date}",
    completedAt: "Completed: {date}",
    noDate: "No date",
    targetsMetric: "Targets: {count}",
    sentMetric: "Sent: {count}",
    errorMetric: "Errors: {count}",
    groupMetric: "Groups: {count}",
    contactMetric: "Contacts: {count}",
    pendingMetric: "Pending: {count}",
    retryingMetric: "Retrying: {count}",
    deleteEveryoneAvailable: "Delete for everyone is available.",
    deleteEveryoneExpired: "The delete-for-everyone window has expired.",
    deleteEveryoneProgress: "Delete for everyone: {deleted}/{total} deleted, {pending} pending, {failed} failed.",
    statusCompleted: "Completed",
    statusPartiallyCompleted: "Partially completed",
    messageSendPacing: "Two campaigns can start consecutively. The next pair waits at least 5 minutes. Sends to groups are at least 6 seconds apart.",
    statusQueued: "Queued",
    statusSending: "Sending",
    statusFailedMessage: "Failed",
    statusCancelled: "Cancelled",
    teamAccess: "Team Access",
    teamUsersSubtitle: "Invite workspace users and manage their roles and access status.",
    newUserInvite: "Invite a new user",
    nameEmailRequired: "Full name and email are required.",
    copiedToClipboard: "{label} copied to the clipboard.",
    copyFailed: "{label} could not be copied.",
    companyUsers: "Users",
    memberStatus: "Status",
    seatsCount: "{used}/{limit} accounts",
    activeCount: "{active}/{total} active",
    total: "Total",
    totalUsers: "Total users",
    active: "Active",
    invited: "Invited",
    fullName: "Full name",
    role: "Role",
    whatsappSendPaused: "WhatsApp reported a rate limit for this send. Sending pauses for at least 5 minutes. Check the delivery status of failed recipients.",
    whatsappSendSafetyUnavailable: "These sends were stopped because the sending safety check was unavailable. Retry failed recipients after connectivity recovers.",
    roleOwner: "Owner",
    roleAdmin: "Administrator",
    roleOperator: "Operator",
    roleViewer: "Viewer",
    memberStatusActive: "Active",
    memberStatusInvited: "Invited",
    memberStatusSuspended: "Suspended",
    memberStatusRemoved: "Removed",
    userType: "User type",
    standardUser: "Standard User",
    inviteUser: "Invite user",
    invitationReady: "Invitation ready",
    invitationOneTimeNotice: "The invitation is delivered by email with a one-time secure link.",
    invitationDeliveryNotice: "The invitation is delivered by email with a one-time secure link.",
    invitationCode: "Invitation code",
    invitationLink: "Invitation link",
    emailSent: "Sent",
    emailNotSent: "Email delivery is queued and will be retried automatically.",
    emailDelivery: "Email: {status}",
    pendingInvitations: "Pending invitations",
    invitedAt: "Invited: {date}",
    expiresAt: "Expires: {date}",
    usersLoading: "Loading users...",
    userInviteCreated: "Invitation sent successfully.",
    userInviteQueued: "Invitation created. Email delivery has been queued.",
    trialUserInviteUpgrade: "Upgrade to Starter or Professional to invite users.",
    invitationFailed: "Invitation could not be sent.",
    resendInvitation: "Resend invitation",
    invitationResent: "The invitation link was renewed and sent again.",
    userUpdated: "User updated.",
    userUpdateFailed: "User could not be updated.",
    removeUser: "Remove user",
    removeUserConfirm: "Remove {email} from workspace access?",
    remove: "Remove",
    userAccessRemoved: "User access removed.",
    userRemoveFailed: "User could not be removed.",
    revokeInvitation: "Revoke invitation",
    revokeInvitationConfirm: "Revoke the invitation for {email}?",
    invitationRevoked: "Invitation revoked.",
    invitationRevokeFailed: "Invitation could not be revoked.",
    copyValue: "Copy {label}",
    noLastLogin: "No previous sign-in",
    lastLoginAt: "Last sign-in: {date}",
    assignedGroupsTitle: "Assigned groups",
    assignableGroups: "Available groups",
    noAssignableGroups: "No WhatsApp groups are available for assignment yet.",
    noAssignableGroupsDescription: "Connect your WhatsApp account and synchronize groups first.",
    allGroupsAssigned: "No additional groups are available.",
    allGroupsAssignedDescription: "All WhatsApp groups are assigned to this category.",
    contactsSelected: "{count} contacts selected",
    contactCategoryProfessionalRequired: "An active subscription is required to add contacts to categories.",
    assignedContacts: "Assigned contacts",
    noAssignedContactsInView: "No assigned contacts in this view.",
    assignableContacts: "Available contacts",
    allContactsAssigned: "All contacts assigned",
    contactNotFound: "No contacts found",
    allVisibleContactsAssigned: "All visible contacts are in this category.",
    contactSearchHelp: "Refresh WhatsApp contacts or try a different search.",
    tapToRemoveCategory: "Tap to remove from category",
    savedContact: "Saved contact",
    mainMenu: "Main Menu",
    overview: "Overview",
    overviewDescription: "Operations summary and quick actions.",
    accountsDescription: "Connected WhatsApp accounts and connection status.",
    groupsMenuDescription: "Synchronized groups, filters, and category status.",
    categoriesMenuDescription: "Segments, assigned targets, and category management.",
    messagingMenuDescription: "Prepare campaigns for categories, groups, and contacts.",
    historyMenuDescription: "Campaign deliveries and scheduled messages.",
    supportMenuDescription: "Support tickets and feedback.",
    adminSections: "Admin Sections",
    adminControlCenter: "Admin Control Center",
    myAccount: "My Account",
    adminMobileDescription: "Mobile control center connected to the web admin sections.",
    myAccountDescription: "Account, profile, and support areas.",
    companyInfoDescription: "Manage your profile and contact information.",
    teamUsersMenuDescription: "Team users, roles, and access status.",
    subscriptionMenuDescription: "Plan and subscription status.",
    deleteAccountMenuDescription: "Account closure and data deletion request.",
    logoutDeviceDescription: "Sign out on this device.",
    currentPackage: "CURRENT PLAN",
    days: "Days",
    daysCount: "{count} days",
    connectedWhatsApp: "Connected WhatsApp",
    totalGroups: "Total groups",
    sendableMetric: "Sendable",
    openTickets: "Open tickets",
    conversations: "Conversations",
    system: "System",
    tickets: "Tickets",
    whatsappScreenSubtitle: "Connect WhatsApp accounts and manage groups, message delivery, and history in one workspace.",
    warnings: "Warnings",
    categoryList: "Category List",
    assignedTargets: "Assigned targets",
    segmentColor: "Segment color",
    userProfileSubtitle: "Manage your profile, team, and security settings.",
    sessionSecure: "Session secure",
    subscriptionScreenSubtitle: "Plan and subscription period information.",
    sharedSubscription: "Shared subscription",
    sharedSubscriptionExpired: "Shared subscription expired",
    sharedSubscriptionExpiredDescription:
      "The shared subscription has ended. You can still view your information and request your own plan.",
    sharedSubscriptionReadOnly:
      "This plan is managed by the workspace owner. You can view subscription details but cannot change them.",
    subscriptionOwner: "Subscription owner",
    usersReadOnlySharedMembership:
      "Your shared workspace membership is read-only. Active members cannot modify other users.",
    sharedMembershipDeleteScope:
      "This action closes only your shared workspace membership. Other user data remains protected.",
    readOnlyMode: "Read-only mode active",
    readOnlyModeDescription: "Your data is preserved when the subscription expires; operations resume after renewal.",
    teamManagement: "Invite Users",
    teamManagementDescription: "Invite and manage users.",
    manageTeamUsers: "Invite User",
    groupList: "Group List",
    refreshGroups: "Refresh groups",
    refreshingGroups: "Refreshing WhatsApp groups",
    refreshingContacts: "Refreshing WhatsApp contacts",
    connectedContacts: "Connected contacts",
    whatsappRefreshWithoutDisconnect: "Refresh new contacts and groups without disconnecting WhatsApp.",
    whatsappRefreshUnavailableTitle: "Refresh unavailable",
    whatsappRefreshRequiresConnection: "Make sure this WhatsApp account is connected first.",
    whatsappGroupsRefreshCompleteTitle: "Groups updated",
    whatsappGroupsRefreshCompleteDescription: "Updated {count} groups while keeping WhatsApp connected.",
    whatsappContactsRefreshCompleteTitle: "Contacts updated",
    whatsappContactsRefreshCompleteDescription: "Updated {count} contacts while keeping WhatsApp connected.",
    whatsappRefreshQueuedTitle: "Refresh in progress",
    whatsappGroupsRefreshQueuedDescription: "Group refresh is continuing in the background. You do not need to disconnect.",
    whatsappContactsRefreshQueuedDescription: "Contact refresh is continuing in the background. You do not need to disconnect.",
    whatsappContactsRefreshPartialDescription: "Updated {count} contacts for now. Remaining data may finish in the background.",
    whatsappRefreshFailedTitle: "Refresh could not be completed",
    whatsappGroupsRefreshFailed: "WhatsApp groups could not be refreshed.",
    whatsappContactsRefreshFailed: "WhatsApp contacts could not be refreshed.",
    dataPreparing: "Preparing data",
    moduleLoadingDescription: "This section is open and remains responsive while web API data loads.",
    dataSource: "Data source",
    records: "Records",
    noRecords: "No records found",
    liveApi: "Live API",
    summaryApi: "Summary API",
    dataUnavailable: "Data could not be retrieved.",
    supportTicketOpenFailed: "The support ticket could not be opened.",
    replySent: "Reply sent.",
    replyFailed: "Reply could not be sent.",
    ticketStatusUpdated: "Ticket status updated.",
    ticketStatusUpdateFailed: "Ticket status could not be updated.",
    endpointUnavailable: "No web API endpoint is available for this module.",
    noModuleRecordsDescription: "There are no records for this module, or the current endpoint returns summary data only.",
    record: "Record",
    updateStatus: "Update status",
    writeReply: "Write a reply",
    adminReply: "Admin reply",
    userMessage: "User message",
    systemMessage: "System message",
    requestTimedOut: "The data request timed out.",
    ticketClosedReplyDisabled: "Replies are disabled because this ticket is closed.",
    subjectMinLength: "The subject must be at least 3 characters.",
    descriptionMinLength: "The description must be at least 5 characters.",
    issueDetailsPlaceholder: "Describe your issue in detail",
    you: "You",
    logivyaSupport: "Logivya Support",
    verificationCode: "Verification code",
    newPassword: "New password",
    passwordUpdated: "Password updated",
    passwordUpdatedDescription: "You can now sign in with your new password.",
    passwordUpdateFailed: "Password could not be updated",
    codeSent: "Code sent",
    codeSentDescription: "If the details are registered, a verification code has been sent.",
    codeSendFailed: "Code could not be sent",
    identifierPrompt: "Enter your email address or phone number.",
    sendVerificationCode: "Send verification code",
    loginFailed: "Sign-in failed",
    checkYourDetails: "Check your details.",
    secureSessionSaveFailed: "The session could not be stored securely. Please try again.",
    newToLogivya: "New to Logivya?",
    createAccountAction: "Create account",
    alreadyHaveAccount: "Already have an account?",
    signInAction: "Sign in",
    passwordConfirmation: "Confirm password",
    updatePassword: "Update password",
    acceptLabel: "I accept:",
    readAndAcceptLabel: "I have read and accept:",
    termsOfService: "Terms of Service",
    privacyPolicy: "Privacy Policy",
    dataProcessingNotice: "Data Processing Notice",
    invitationLoginPrompt: "Sign in to accept the team invitation.",
    regularLogin: "Sign in without invitation",
    invitationCodeOptional: "Invitation code (optional)",
    approvalRequired: "Approval required",
    legalAcceptanceRequired: "Accept the terms of service, privacy policy, and data processing notice to continue.",
    registrationFailed: "Registration could not be completed",
    invitationRegistration: "You are registering with a team invitation.",
    requestReceived: "Request received",
    accountDisabledDescription: "Your account has been disabled and your session has ended.",
    accountDeleteFailed: "Account could not be closed",
    accountDeleteWarning: "This action disables your account, closes active sessions, and stops campaigns.",
    accountDeleteFullWarning: "This action disables your account, closes active sessions, and stops campaigns. Payment, security, and audit records that must be retained by law may be preserved for the required period.",
    confirmationPrompt: "Type the text below to continue:",
    confirmationTextLabel: "Confirmation text",
    closeAccount: "Close account",
    accountClosurePhrase: "CLOSE MY LOGIVYA ACCOUNT",
    adminDashboardModule: "Admin Dashboard",
    adminCompaniesModule: "Workspaces",
    adminUsersModule: "Users",
    adminRolesModule: "Roles",
    adminBillingModule: "Billing",
    adminSubscriptionsModule: "Subscriptions",
    adminInvoicesModule: "Invoices",
    adminPaymentsModule: "Payments",
    adminWhatsAppModule: "WhatsApp Accounts",
    adminCampaignsModule: "Campaigns",
    adminSupportModule: "Support",
    adminSecurityModule: "Security",
    adminTrialRiskModule: "Trial Risk",
    adminComplianceModule: "Compliance",
    adminPrivacyModule: "Privacy Center",
    adminPrivacyDescription: "Monitor data requests, exports, deletion, retention, and breach workflows.",
    adminAuditModule: "Audit Center",
    adminActivityModule: "Activity Center",
    adminNotificationsModule: "Notifications",
    adminDataRequestsModule: "Data Requests",
    adminMetricsModule: "Metrics",
    adminSystemHealthModule: "System Health",
    adminBackupsModule: "Backups",
    adminDisasterRecoveryModule: "Disaster Recovery",
    adminReleasesModule: "Release Center",
    adminSettingsModule: "Settings",
    adminFeatureFlagsModule: "Feature Flags",
    adminAnnouncementsModule: "Announcements",
    adminApiUsageModule: "API Usage",
    adminWebhooksModule: "Webhooks",
    adminPlatformSettingsModule: "Platform Settings"
    ,adminDashboardDescription: "Summary of operations, subscriptions, and platform status."
    ,adminCompaniesDescription: "Platform workspaces and status management."
    ,adminUsersDescription: "User, session, device, and role management."
    ,adminRolesDescription: "Manage administrator, operator, and support roles."
    ,adminBillingDescription: "Invoice, payment, and subscription workflows."
    ,adminSubscriptionsDescription: "Subscription statuses and manual activations."
    ,adminInvoicesDescription: "Invoice records and statuses."
    ,adminPaymentsDescription: "Payment approval, rejection, and collection workflows."
    ,adminWhatsAppDescription: "Sessions, connected accounts, and connection status."
    ,adminCampaignsDescription: "Message and campaign operations."
    ,adminSupportDescription: "Platform support tickets."
    ,adminSecurityDescription: "Security events and access controls."
    ,adminTrialRiskDescription: "Trial eligibility, risk signals, and manual review decisions."
    ,adminComplianceDescription: "Consent and data subject workflows."
    ,adminAuditDescription: "Audit records and traceability."
    ,adminActivityDescription: "Platform activity stream."
    ,adminNotificationsDescription: "Admin notifications and read status."
    ,adminDataRequestsDescription: "Access, export, and deletion requests."
    ,adminMetricsDescription: "Platform metrics and usage indicators."
    ,adminSystemHealthDescription: "Service and integration status."
    ,adminBackupsDescription: "Backup and restore operations."
    ,adminDisasterRecoveryDescription: "Recovery plan and operational continuity."
    ,adminReleasesDescription: "Monitor signed artifacts, validation checks, tests, approvals, store submissions, and rollout records."
    ,adminSettingsDescription: "Admin settings and platform configuration."
    ,adminFeatureFlagsDescription: "Operational status of platform features."
    ,adminAnnouncementsDescription: "User announcements and platform messages."
    ,adminApiUsageDescription: "API and integration usage signals."
    ,adminWebhooksDescription: "Webhook and integration workflows."
    ,adminPlatformSettingsDescription: "General platform configuration."
    ,"common.status": "Status"
    ,"notification.category.marketplace": "Logistics marketplace"
    ,"groups.unavailable": "Unavailable"
    ,"status.completed": "Completed"
    ,"status.sending": "Sending"
    ,"status.partially_completed": "Partially completed"
    ,"status.scheduled": "Scheduled"
    ,"accountStatus.PENDING_QR": "Waiting for scan"
    ,"accountStatus.CONNECTING": "Connecting"
    ,"accountStatus.CONNECTED": "Connected"
    ,"accountStatus.DISCONNECTED": "Disconnected"
    ,"accountStatus.RECONNECT_REQUIRED": "Reconnect required"
    ,"accountStatus.ARCHIVED": "Archived"
    ,"accountStatus.ERROR": "Failed"
    ,"status.queued": "Queued"
    ,"status.failed": "Failed"
    ,"status.canceled": "Canceled"
    ,"status.draft": "Draft"
    ,"priority.low": "Low"
    ,"priority.medium": "Medium"
    ,"priority.high": "High"
    ,"priority.urgent": "Urgent"
    ,"status.open": "Open"
    ,"status.pending": "Pending"
    ,"status.answered": "Answered"
    ,"status.closed": "Closed"
    ,"status.active": "Active"
    ,"status.inactive": "Inactive"
    ,"status.unknown": "Unknown"
    ,"status.healthy": "Healthy"
    ,"status.ok": "Operational"
    ,"adminSubscriptions.companiesLoadFailed": "Workspaces could not be loaded. Please try again."
    ,"adminSubscriptions.manualActivationCreated": "The subscription was activated and its audit record was created."
    ,"adminSubscriptions.actionCompleted": "The subscription action was completed."
    ,"adminSubscriptions.eyebrow": "Platform Administration"
    ,"adminSubscriptions.title": "Manual Subscription Management"
    ,"adminSubscriptions.description": "Securely manage subscriptions for bank transfers and manual payments."
    ,"adminSubscriptions.shownCompanies": "Workspaces shown"
    ,"adminSubscriptions.activeSubscriptions": "Active subscriptions"
    ,"adminSubscriptions.trialAccounts": "Trial accounts"
    ,"adminSubscriptions.incompleteBillingProfiles": "Incomplete billing profiles"
    ,"adminSubscriptions.selectCompany": "Select a workspace"
    ,"adminSubscriptions.plan": "Plan"
    ,"adminSubscriptions.billingPeriod": "Billing period"
    ,"adminSubscriptions.monthly": "Monthly"
    ,"adminSubscriptions.yearly": "Yearly"
    ,"adminSubscriptions.startDate": "Start date"
    ,"adminSubscriptions.endDate": "End date"
    ,"adminSubscriptions.paymentMethod": "Payment method"
    ,"adminSubscriptions.bankTransfer": "Bank transfer"
    ,"adminSubscriptions.manual": "Manual"
    ,"adminSubscriptions.freePromo": "Free or promotional"
    ,"adminSubscriptions.currency": "Currency"
    ,"adminSubscriptions.actionReason": "Action reason"
    ,"adminSubscriptions.assignmentReasonPlaceholder": "Describe the assignment reason"
    ,"adminSubscriptions.manualActivate": "Activate manually"
    ,"adminSubscriptions.searchPlaceholder": "Search workspace, user, email, or phone"
    ,"adminSubscriptions.search": "Search"
    ,"adminSubscriptions.billingProfile": "Billing profile"
    ,"adminSubscriptions.seats": "Accounts"
    ,"adminSubscriptions.start": "Start"
    ,"adminSubscriptions.end": "End"
    ,"adminSubscriptions.trialDuration": "Trial period"
    ,"adminSubscriptions.incomplete": "Incomplete"
    ,"adminSubscriptions.reconciliationRequired": "Reconciliation required"
    ,"adminSubscriptions.configurationRequired": "Configuration required"
    ,"adminSubscriptions.noActivePackage": "No active package"
    ,"adminSubscriptions.extensionDays": "Extension period (days)"
    ,"adminSubscriptions.viewDetails": "View details"
    ,"adminSubscriptions.action": "Subscription action"
    ,"adminSubscriptions.actionWarning": "This action may change the subscription status and entitlements. Enter a reason to continue."
    ,"adminSubscriptions.newEndDate": "New end date"
    ,"adminSubscriptions.newPlan": "New plan"
    ,"adminSubscriptions.actionDescription": "Action description"
    ,"adminSubscriptions.actionReasonPlaceholder": "Describe the reason for this action"
    ,"adminSubscriptions.dismiss": "Dismiss"
    ,"adminSubscriptions.processing": "Processing..."
    ,"adminSubscriptions.confirm": "Confirm"
    ,"adminSubscriptions.trialRemaining": "{duration} days · {remaining} days remaining"
    ,"adminSubscriptions.trialExpired": "{duration} days · Expired"
    ,"adminSubscriptions.action.activate": "Activate"
    ,"adminSubscriptions.action.extend": "Extend"
    ,"adminSubscriptions.action.suspend": "Suspend"
    ,"adminSubscriptions.action.cancel": "Cancel"
    ,"adminSubscriptions.action.change_plan": "Change plan"
    ,"adminSubscriptions.seatReconciliationError": "The plan could not be changed: {used} accounts are in use and the target plan allows {limit}. Suspend or remove excess members first."
    ,"adminSubscriptions.billingProfileIncomplete": "The billing profile is incomplete."
    ,"adminSubscriptions.validationError": "Check the required fields and date range."
    ,"adminSubscriptions.genericError": "The action could not be completed. Check the information and try again."
    ,"adminPayments.approved": "Payment approved."
    ,"adminPayments.rejectionReason": "Payment rejection reason (at least 5 characters):"
    ,"adminPayments.rejected": "Payment rejected."
    ,"adminPayments.eyebrow": "Billing Operations"
    ,"adminPayments.title": "Payments"
    ,"adminPayments.description": "Review, approve, or reject payment requests with a clear reason."
    ,"adminPayments.amount": "Amount"
    ,"adminPayments.approve": "Approve"
    ,"adminPayments.reject": "Reject"
    ,"adminPayments.empty": "No payment records found."
    ,"adminSupport.internalNote": "Internal note"
    ,"adminSupport.adminReply": "Administrator reply"
    ,"adminSupport.userMessage": "User message"
    ,"adminSupport.systemMessage": "System message"
    ,"adminSupport.statusUpdateFailed": "Ticket status could not be updated."
    ,"adminSupport.statusUpdated": "Ticket status updated."
    ,"adminSupport.eyebrow": "Logivya Support Operations"
    ,"adminSupport.title": "Support Tickets"
    ,"adminSupport.description": "Manage support tickets from every workspace in one central workflow."
    ,"adminSupport.searchPlaceholder": "Search subject, workspace, user, or email..."
    ,"adminSupport.refresh": "Refresh"
    ,"adminSupport.all": "All"
    ,"adminSupport.ticketCount": "{count} support tickets"
    ,"adminSupport.ticket": "Ticket"
    ,"adminSupport.userEmail": "User email"
    ,"adminSupport.lastMessage": "Last message"
    ,"adminSupport.openTicket": "Open ticket"
    ,"adminSupport.previous": "Previous"
    ,"adminSupport.page": "Page {page} / {pages}"
    ,"adminSupport.next": "Next"
    ,"adminSupport.ticketLoading": "Loading ticket..."
    ,"adminSupport.selectTicket": "Select a ticket to view details."
    ,"adminSupport.ticketStatus": "Ticket status"
    ,"adminSupport.update": "Update"
    ,"adminSupport.writeReply": "Write a reply"
    ,"adminSupport.replyPlaceholder": "Write a reply to the user..."
    ,"adminSupport.sendReply": "Send reply"
    ,"adminSupport.threadNotice": "User and administrator replies appear in this conversation after real-time refresh."
    ,"status.in_progress": "In progress"
    ,"status.resolved": "Resolved"
    ,"common.yes": "Yes"
    ,"common.no": "No"
    ,"notification.title.ACCOUNT_ARCHIVED": "WhatsApp account archived"
    ,"notification.title.PAYMENT_RECEIVED": "Payment received"
    ,"notification.title.PAYMENT_REJECTED": "Payment rejected"
    ,"notification.title.SUPPORT_REPLY": "New support reply"
    ,"notification.title.SUBSCRIPTION_ACTIVATED": "Subscription activated"
    ,"notification.title.SUBSCRIPTION_CANCELED": "Subscription canceled"
    ,"notification.title.SUBSCRIPTION_EXPIRED": "Subscription expired"
    ,"notification.title.TRIAL_EXPIRED": "Trial expired"
    ,"notification.title.TRIAL_STARTED": "Trial started"
    ,"payment.status.pending": "Pending"
    ,"payment.status.paid": "Paid"
    ,"payment.status.succeeded": "Succeeded"
    ,"payment.status.failed": "Failed"
    ,"payment.status.refunded": "Refunded"
    ,"payment.status.canceled": "Canceled"
    ,"adminFeatureFlags.enabled": "Enabled"
    ,"adminFeatureFlags.disabled": "Disabled"
    ,"adminPlatform.configured": "Configured"
    ,"adminPlatform.notConfigured": "Not configured"
    ,"status.deleted": "Deleted"
    ,"status.suspended": "Suspended"
    ,"accountStatus.FAILED": "Failed"
    ,"accountStatus.RECONNECTING": "Reconnecting"
    ,"dataRequest.status.requested": "Requested"
    ,"dataRequest.status.verifying": "Verifying"
    ,"dataRequest.status.processing": "Processing"
    ,"dataRequest.status.completed": "Completed"
    ,"dataRequest.status.rejected": "Rejected"
    ,"security.event.SUSPICIOUS_LOGIN": "Suspicious sign-in"
    ,"security.event.AUTH_FAILURE": "Authentication failure"
    ,"security.event.ACCESS_DENIED": "Access denied"
    ,"webhook.status.pending": "Pending"
    ,"webhook.status.delivered": "Delivered"
    ,"webhook.status.failed": "Failed"
    ,"webhook.status.dead_letter": "Dead letter"
    ,"adminBackups.runbookReady": "Runbook ready"
    ,"status.whatsapp.connected": "Connected"
    ,"status.whatsapp.disconnected": "Not connected"
    ,"status.whatsapp.failed": "Connection failed"
    ,"status.whatsapp.error": "Connection failed"
    ,"status.whatsapp.pending_qr": "Waiting for QR code"
    ,"status.whatsapp.qr_ready": "QR code ready"
    ,"status.whatsapp.pending_phone": "Waiting for phone code"
    ,"status.whatsapp.pending_pairing": "Waiting for phone code"
    ,"status.whatsapp.pairing_code_ready": "Phone code ready"
    ,"status.whatsapp.connecting": "Connecting"
    ,"status.whatsapp.reconnecting": "Reconnecting"
    ,"status.whatsapp.reconnect_required": "Reconnect required"
    ,"status.whatsapp.archived": "Archived"
    ,"status.subscription.trial": "Trial"
    ,"status.subscription.active": "Active"
    ,"status.subscription.expired": "Expired"
    ,"status.subscription.suspended": "Suspended"
    ,"status.subscription.cancelled": "Cancelled"
    ,"status.subscription.manual_pending": "Pending approval"
    ,"status.subscription.past_due": "Payment overdue"
    ,"status.payment.pending": "Pending"
    ,"status.payment.manually_confirmed": "Manually confirmed"
    ,"status.payment.paid": "Paid"
    ,"status.payment.succeeded": "Succeeded"
    ,"status.payment.failed": "Failed"
    ,"status.payment.rejected": "Rejected"
    ,"status.payment.refunded": "Refunded"
    ,"status.payment.canceled": "Cancelled"
    ,"status.invoice.draft": "Draft"
    ,"status.invoice.issued": "Issued"
    ,"status.invoice.paid": "Paid"
    ,"status.invoice.cancelled": "Cancelled"
    ,"status.invoice.failed": "Failed"
    ,"status.message.completed": "Completed"
    ,"status.message.partially_completed": "Partially completed"
    ,"status.message.failed": "Failed"
    ,"status.message.pending": "Pending"
    ,"status.message.queued": "Queued"
    ,"status.message.scheduled": "Scheduled"
    ,"status.message.sending": "Sending"
    ,"status.message.cancelled": "Cancelled"
    ,"status.message.deleted": "Deleted"
    ,"status.message.draft": "Draft"
    ,"notification.title.whatsapp.connected": "WhatsApp connected"
    ,"notification.title.whatsapp.disconnected": "WhatsApp connection interrupted"
    ,"notification.title.whatsapp.qr_expired": "QR code expired"
    ,"notification.title.whatsapp.qr_connected": "QR connection completed"
    ,"notification.title.whatsapp.phone_code_connected": "Phone code accepted"
    ,"notification.title.whatsapp.account_archived": "WhatsApp account archived"
    ,"notification.title.whatsapp.account_deleted": "WhatsApp account deleted"
    ,"notification.title.campaign.completed": "Campaign completed"
    ,"notification.title.campaign.failed": "Campaign failed"
    ,"notification.title.campaign.partial_delivery": "Campaign partially delivered"
    ,"notification.title.campaign.scheduled_started": "Scheduled campaign started"
    ,"notification.title.campaign.scheduled_finished": "Scheduled campaign completed"
    ,"notification.title.subscription.trial_ending": "Trial ending soon"
    ,"notification.title.subscription.trial_expired": "Trial expired"
    ,"notification.title.subscription.activated": "Subscription activated"
    ,"notification.title.subscription.renewed": "Subscription renewed"
    ,"notification.title.subscription.cancelled": "Subscription cancelled"
    ,"notification.title.subscription.payment_failed": "Subscription payment failed"
    ,"notification.title.support.ticket_created": "Support request created"
    ,"notification.title.support.admin_replied": "New support reply"
    ,"notification.title.support.ticket_closed": "Support request closed"
    ,"notification.title.support.ticket_reopened": "Support request reopened"
    ,"notification.title.admin.company_registered": "New account registered"
    ,"notification.title.admin.payment_created": "New payment received"
    ,"notification.title.admin.trial_expiring": "Customer trial ending"
    ,"notification.title.admin.high_priority_support_ticket": "High-priority support request"
    ,"notification.title.admin.whatsapp_account_failure": "WhatsApp account failure"
    ,"status.waiting_for_user": "Waiting for user"
    ,"status.waiting_for_admin": "Waiting for support"
    ,"priority.normal": "Normal"
    ,"notification.title.support.admin_new_ticket": "New support request"
    ,"notification.title.support.user_replied": "New user reply"
    ,"notification.title.support.status_changed": "Support request updated"
    ,"notification.channel.in_app": "In-app"
    ,"notification.channel.email": "Email"
    ,"notification.channel.android_push": "Android push"
    ,"notification.channel.ios_push": "iOS push"
    ,"notification.channel.web_push": "Web push"
    ,"notification.category.account": "Account"
    ,"notification.category.security": "Security"
    ,"notification.category.support": "Support"
    ,"notification.category.subscription": "Subscription"
    ,"notification.category.billing": "Billing"
    ,"notification.category.invitation": "Invitation"
    ,"notification.category.whatsapp": "WhatsApp"
    ,"notification.category.message": "Message"
    ,"notification.category.system": "System"
    ,"notification.category.marketing": "Marketing"
    ,"notification.category.compliance": "Compliance"
    ,"notification.category.administration": "Administration"
    ,"notification.category.backup": "Backup"
    ,"notification.category.incident": "Incident"
    ,"notifications.admin.platformAnnouncement": "Platform announcement"
    ,"notifications.admin.platformAnnouncementDescription": "Create a draft, review its exact audience and channels, then explicitly approve publication."
    ,"notifications.admin.title": "Title"
    ,"notifications.admin.message": "Message"
    ,"notifications.admin.deepLink": "Internal deep link (optional)"
    ,"notifications.admin.locale": "Language"
    ,"notifications.admin.priority": "Priority"
    ,"notifications.admin.channels": "Channels"
    ,"notifications.admin.startTime": "Start time"
    ,"notifications.admin.endTime": "End time (optional)"
    ,"notifications.admin.createDraft": "Create draft"
    ,"notifications.admin.previewAndPublish": "Preview and publish"
    ,"notifications.admin.cancel": "Cancel"
    ,"notifications.admin.noAnnouncements": "No announcement drafts yet."
    ,"notifications.admin.unresolvedDeadLetters": "Unresolved dead letters"
    ,"notifications.admin.deadLetterDescription": "Retry only after the underlying provider or configuration issue is repaired."
    ,"notifications.admin.event": "Event"
    ,"notifications.admin.channel": "Channel"
    ,"notifications.admin.error": "Error"
    ,"notifications.admin.attempts": "Attempts"
    ,"notifications.admin.date": "Date"
    ,"notifications.admin.retry": "Retry"
    ,"notifications.admin.noDeadLetters": "No unresolved dead letters."
    ,"notifications.admin.versionedTemplates": "Versioned notification templates"
    ,"notifications.admin.versionedTemplatesDescription": "New versions begin as drafts and require explicit administrator approval."
    ,"notifications.admin.templateName": "Template name"
    ,"notifications.admin.emailSubject": "Email subject"
    ,"notifications.admin.templateBody": "Message body with {{variable}} placeholders"
    ,"notifications.admin.requiredVariables": "Required variables, comma separated"
    ,"notifications.admin.preview": "Preview"
    ,"notifications.admin.testSelf": "Test myself"
    ,"notifications.admin.active": "Active"
    ,"notifications.admin.approve": "Approve"
    ,"notifications.admin.noTemplates": "No versioned templates yet. Code fallbacks remain active."
    ,"notifications.admin.providerReadiness": "Provider readiness"
    ,"notifications.admin.providerReadinessDescription": "Only safe configuration metadata is shown. Credentials are never returned."
    ,"notifications.admin.draftCreated": "Announcement draft created."
    ,"notifications.admin.draftFailed": "Announcement draft could not be created."
    ,"notifications.admin.previewStale": "The announcement preview is no longer current."
    ,"notifications.admin.audience": "Audience"
    ,"notifications.admin.platformAllUsers": "All platform users"
    ,"notifications.admin.schedule": "Schedule"
    ,"notifications.admin.continueConfirmation": "Continue to the controlled publication confirmation?"
    ,"notifications.admin.typeExactly": "Type exactly"
    ,"notifications.admin.confirmationMismatch": "The confirmation text does not match."
    ,"notifications.admin.largeAudience": "Large audience confirmation"
    ,"notifications.admin.publishFailed": "The announcement could not be published."
    ,"notifications.admin.announcementQueued": "Announcement queued for recipients"
    ,"notifications.admin.cancelReason": "Enter the cancellation reason (at least 5 characters)."
    ,"notifications.admin.announcementCanceled": "Announcement canceled."
    ,"notifications.admin.cancelFailed": "The announcement could not be canceled."
    ,"notifications.admin.retryReason": "Describe the repaired cause before retrying (at least 5 characters)."
    ,"notifications.admin.retryQueued": "Delivery queued for a safe retry."
    ,"notifications.admin.retryFailed": "The delivery could not be queued for retry."
    ,"notifications.admin.templateDraftCreated": "Template draft created."
    ,"notifications.admin.templateCreateFailed": "The template draft could not be created."
    ,"notifications.admin.templateApproved": "Template approved and activated."
    ,"notifications.admin.templateApproveFailed": "The template could not be approved."
    ,"notifications.admin.templatePreviewFailed": "The template preview could not be generated."
    ,"notifications.admin.testConfirm": "Send a controlled test only to your administrator account?"
    ,"notifications.admin.testCompleted": "The controlled test was sent to your administrator account."
    ,"notifications.admin.testFailed": "The controlled test could not be sent."
    ,"notifications.admin.priorityLow": "Low"
    ,"notifications.admin.priorityNormal": "Normal"
    ,"notifications.admin.priorityHigh": "High"
    ,"notifications.admin.priorityCritical": "Critical"
    ,"adminReleases.blocked": "Blocked"
    ,"adminSubscriptions.manual.sellerConfigurationTitle": "LOGIVYA Seller and Legal Document Configuration"
    ,"adminSubscriptions.manual.sellerConfigurationDescription": "Manage the official seller information and legal document status here."
    ,"adminSubscriptions.manual.officialSellerName": "Official seller name / trade name"
    ,"adminSubscriptions.manual.tradeRegistryNumber": "Trade registry number"
    ,"adminSubscriptions.manual.notApplicableSoleProprietor": "Not applicable to a sole proprietorship"
    ,"adminSubscriptions.manual.mersisNumber": "MERSIS number"
    ,"adminSubscriptions.manual.verifySellerIdentity": "I verified the seller identity against official documents."
    ,"adminSubscriptions.manual.verifyLegalDocuments": "Professional review of LOGIVYA legal documents is complete."
    ,"adminSubscriptions.manual.configurationSource": "Reason for change"
    ,"adminSubscriptions.manual.configurationSourcePlaceholder": "Specify the document and verification source"
    ,"adminSubscriptions.manual.configurationReady": "Ready to use"
    ,"adminSubscriptions.manual.missingFields": "{count} missing fields"
    ,"adminSubscriptions.manual.configurationSavedReady": "Seller configuration was saved and bank-transfer requests are ready."
    ,"adminSubscriptions.manual.configurationSavedMissing": "Configuration was saved. Missing fields: {fields}"
    ,"adminSubscriptions.manual.configurationSaveFailed": "Seller configuration could not be saved."
    ,"adminSubscriptions.manual.saveConfiguration": "Save Configuration"
    ,"adminSubscriptions.manual.takeReview": "Start review"
    ,"adminSubscriptions.manual.approvePayment": "Approve payment"
    ,"adminSubscriptions.manual.requestClarification": "Request clarification"
    ,"adminSubscriptions.manual.rejectRequest": "Reject request"
    ,"adminSubscriptions.manual.bankChecked": "I checked the LOGIVYA bank account; the amount and reference match this request."
    ,"adminSubscriptions.manual.customerNote": "Message shown to the user"
    ,"adminSubscriptions.manual.internalNote": "Internal administrator note"
    ,"notification.title.marketplace.request_match_found": "A matching listing was found"
    ,groupsLoadFailed: "Groups could not be loaded."
    ,dashboardLoadFailed: "Overview could not be loaded."
    ,profileLoadFailed: "Profile information could not be loaded."
    ,categoriesLoadFailed: "Categories could not be loaded."
    ,categoryCreated: "Category created."
    ,categoryCreateFailed: "Category could not be created."
    ,categoryUpdated: "Category updated."
    ,categoryUpdateFailed: "Category could not be updated."
    ,categoryDeleted: "Category deleted."
    ,categoryDeleteFailed: "Category could not be deleted."
    ,notificationsLoadMoreFailed: "More notifications could not be loaded."
    ,notificationUpdateFailed: "Notification could not be updated."
    ,notificationsUpdateFailed: "Notifications could not be updated."
    ,subscriptionLoadFailed: "Subscription information could not be loaded."
    ,subscriptionUpgradeFailed: "The plan upgrade request could not be created."
    ,billingProfileIncompleteError: "Complete your profile and contact information before creating a subscription request."
    ,billingCheckoutUnavailableError: "The purchase could not be completed right now. Please contact LOGIVYA support."
    ,billingLegalConsentRequiredError: "Read and accept each of the three legal documents to continue."
    ,"billing.manual.selectPlan": "Select Plan"
    ,"billing.manual.selected": "Selected"
    ,"billing.manual.consentTitle": "Contract Approval"
    ,"billing.manual.consentDescription": "The information below will be added to your order summary."
    ,"billing.manual.purchase": "Purchase"
    ,"billing.ios.managedTitle": "Subscription information"
    ,"billing.ios.managedDescription": "Your current plan is shown above. The store-distributed app does not sell subscriptions or digital feature upgrades."
    ,"billing.ios.storeTitle": "Subscribe with Apple"
    ,"billing.ios.storeDescription": "Activate your plan securely through the App Store."
    ,"billing.ios.loadingProducts": "Loading App Store plans..."
    ,"billing.ios.subscribe": "Subscribe with Apple"
    ,"billing.ios.restore": "Restore Purchases"
    ,"billing.ios.restored": "Your purchase was restored."
    ,"billing.ios.nothingToRestore": "No active purchase was found to restore."
    ,"billing.ios.purchaseSuccess": "Your subscription is active."
    ,"billing.ios.purchaseFailed": "The Apple purchase could not be completed."
    ,"billing.ios.productsUnavailable": "App Store plans are currently unavailable. Please try again."
    ,"billing.ios.ownerOnly": "Only the workspace owner can purchase or renew a subscription."
    ,"billing.ios.renewalDisclosure": "The subscription renews automatically unless canceled at least 24 hours before the current period ends. Payment is charged to your Apple Account. Manage it in your App Store account settings."
    ,"billing.ios.trialDisclosure": "Apple applies a 7-day free trial when you are eligible."
    ,"billing.ios.terms": "Terms of Use"
    ,"billing.ios.privacy": "Privacy Policy"
    ,"billing.google.storeTitle": "Subscribe with Google Play"
    ,"billing.google.storeDescription": "Activate your plan securely through Google Play."
    ,"billing.google.loadingProducts": "Loading Google Play plans..."
    ,"billing.google.subscribe": "Subscribe with Google Play"
    ,"billing.google.restore": "Restore Purchases"
    ,"billing.google.restored": "Your purchase was restored."
    ,"billing.google.nothingToRestore": "No active purchase was found to restore."
    ,"billing.google.purchaseSuccess": "Your subscription is active."
    ,"billing.google.purchaseFailed": "The Google Play purchase could not be completed."
    ,"billing.google.productsUnavailable": "Google Play plans are currently unavailable. Please try again."
    ,"billing.google.ownerOnly": "Only the workspace owner can purchase or renew a subscription."
    ,"billing.google.renewalDisclosure": "The subscription renews automatically under Google Play terms. Payment is charged to your Google Play account. Manage it in your Google Play account settings."
    ,"billing.google.terms": "Terms of Use"
    ,"billing.google.privacy": "Privacy Policy"
    ,"billing.manual.distanceSalesAgreement": "Distance Sales Agreement"
    ,"billing.manual.preInformationForm": "Preliminary Information Form"
    ,"billing.manual.refundPolicy": "Refund and Withdrawal Policy"
    ,"billing.manual.consentText": "I have read and accept the Distance Sales Agreement, Preliminary Information Form, and Refund and Withdrawal Policy. I request that the digital service begin after payment approval and plan activation."
    ,"billing.manual.requestCreatedTitle": "Your subscription request was created"
    ,"billing.manual.requestCreatedDescription": "Your package will be activated by an administrator after your payment is reviewed."
    ,"billing.manual.pendingPayment": "Payment Pending"
    ,"billing.manual.paymentReview": "Payment Under Review"
    ,"billing.manual.approved": "Approved"
    ,"billing.manual.rejected": "Rejected"
    ,"billing.manual.viewPaymentDetails": "View Payment Details"
    ,"billing.manual.bankName": "Bank Name"
    ,"billing.manual.accountHolder": "Account Holder"
    ,"billing.manual.paymentReference": "Transfer Description"
    ,"billing.manual.registeredEmail": "Registered Email"
    ,"billing.manual.profileFirstNameMissing": "Your registered first name is required to continue."
    ,"billing.manual.profileLastNameMissing": "Your registered last name is required to continue."
    ,"billing.manual.profileEmailMissing": "Your registered email is required to continue."
    ,"billing.manual.activeSharedMembership": "You cannot request a personal plan until your active shared membership ends."
    ,"billing.manual.consentRequired": "You must accept the agreements and immediate digital-service performance after payment approval."
    ,"billing.manual.copy": "Copy"
    ,"billing.manual.myRequests": "My Subscription Requests"
    ,"billing.manual.newAdminRequest": "New subscription request"
    ,"billing.manual.paymentApprovedTitle": "Your subscription payment was approved"
    ,"billing.manual.duplicatePending": "You already have a pending subscription request for this plan."
    ,"billing.manual.unspecified": "Not specified"
    ,"billing.manual.close": "Close"
    ,"billing.manual.transferInstruction": "Write your LOGIVYA registered email in the bank transfer description. It must exactly match the email registered on your LOGIVYA account."
    ,"billing.manual.requestDate": "Request date"
    ,"billing.manual.paymentPeriod": "Payment period"
    ,"billing.manual.amount": "Amount"
    ,"billing.manual.transferDetails": "Bank transfer details"
    ,"billing.manual.requestHistoryDescription": "Track your bank transfer requests and administrator review status here."
    ,"billing.manual.noRequests": "You do not have a subscription request yet."
    ,"billing.manual.cancelRequest": "Cancel request"
    ,"billing.manual.purchaseFailed": "The purchase could not be completed right now. Please contact LOGIVYA support."
    ,"billing.manual.submitting": "Creating request..."
    ,"billing.manual.legalDocuments": "Legal documents"
    ,"billing.manual.serviceProvider": "Seller / Service Provider"
    ,"billing.manual.purchaserInfo": "Purchaser information"
    ,"billing.manual.orderSummary": "Order summary"
    ,"billing.manual.cancel": "Cancel"
    ,"billing.manual.plan": "Plan"
    ,"billing.manual.account": "Account"
    ,"billing.manual.brandingSignature": "LOGIVYA signature"
    ,"billing.manual.brandingVisible": "Visible in messages"
    ,"billing.manual.brandingHidden": "Hidden in messages"
    ,"billing.manual.nameTitle": "Full name"
    ,"billing.manual.email": "Email"
    ,"billing.manual.phone": "Phone"
    ,"billing.manual.address": "Address"
    ,"billing.manual.tax": "Tax"
    ,"billing.manual.status": "Status"
    ,supportTicketsLoadFailed: "Support tickets could not be loaded."
    ,supportTicketCreated: "Your support ticket has been created."
    ,supportTicketCreateFailed: "The support ticket could not be created."
    ,whatsappAccountsRetry: "Accounts could not be loaded. Please try again."
    ,whatsappAccountsLoadFailed: "WhatsApp accounts could not be loaded."
    ,whatsappQrCreateFailed: "The QR code could not be created."
    ,whatsappPhoneCodeCreateFailed: "The phone code could not be created."
    ,whatsappConnectionFailed: "The connection could not be established."
    ,whatsappStatusLoadFailed: "Connection status could not be loaded."
    ,turkeyMobilePhoneInvalid: "Enter a valid Turkish mobile number."
    ,roleManager: "Manager"
    ,roleSupport: "Support"
    ,roleUser: "User"
    ,roleSuperAdmin: "Super Administrator"
    ,subscriptionInactiveError: "Your subscription is not active. Renew your plan to send messages."
    ,messagingPermissionDeniedError: "You do not have permission to send messages."
    ,operationForbiddenError: "You do not have permission to perform this action."
    ,alreadyMemberError: "This user is already a member of the workspace."
    ,invitationAlreadyPendingError: "A pending invitation already exists for this email address."
    ,selfInvitationError: "You cannot invite yourself."
    ,invalidInvitationEmailError: "Enter a valid email address."
    ,invitationNameRequiredError: "Enter the user's full name."
    ,invitationPermissionDeniedError: "You do not have permission to invite users."
    ,invitationDeliveryConfigurationError: "The invitation email service is unavailable. Please try again later."
    ,invitationRequestFailedError: "The invitation could not be completed right now."
    ,userSeatLimitReachedError: "You have reached your plan's user limit."
    ,networkTimeoutError: "The server did not respond. Please try again."
    ,secureConnectionError: "A secure connection could not be established. Check your device date, time, and internet connection."
    ,dnsError: "The server address could not be resolved. Check your internet connection."
    ,serverUnreachableError: "The server could not be reached. Check your internet connection."
    ,invalidCredentialsError: "The email address, phone number, or password is incorrect."
    ,mobileAccessDeniedError: "This account does not have mobile access."
    ,invalidInputError: "The entered information is invalid."
    ,accountExistsError: "An account already exists with these details."
    ,serviceConfigurationError: "The service configuration is incomplete. Please try again later."
    ,whatsappServiceUnavailableError: "The WhatsApp connection and messaging service is currently unavailable. Try again after the service has restarted."
    ,serverError: "Server error. Please try again later."
    ,operationFailedError: "The operation could not be completed right now."
    ,invalidServerResponseError: "The server returned an invalid response."
    ,more: "More"
    ,module: "Module"
    ,accounts: "Accounts"
    ,history: "History"
    ,colorOrange: "Orange"
    ,colorBlue: "Blue"
    ,colorGreen: "Green"
    ,colorRed: "Red"
    ,colorPurple: "Purple"
    ,colorYellow: "Yellow"
    ,colorGray: "Gray"
    ,colorBlack: "Black"
    ,mfaTitle: "Two-step verification"
    ,mfaSubtitle: "Enter the 6-digit code from your authenticator app."
    ,mfaSetupTitle: "Set up Authenticator"
    ,mfaSetupSubtitle: "Scan the QR code with your authenticator app, then enter the generated code."
    ,mfaCode: "Verification or recovery code"
    ,mfaVerify: "Verify and sign in"
    ,mfaChooseMethod: "Choose a security method"
    ,mfaAuthenticatorMethod: "Authenticator app"
    ,mfaEmailMethod: "Email verification"
    ,mfaUseAnotherMethod: "Use another method"
    ,mfaResendEmail: "Resend code"
    ,mfaEmailSent: "A verification code was sent to {email}."
    ,mfaCodeInvalidError: "The verification code is invalid or expired. Enter the new code and try again."
    ,mfaCodeReusedError: "This verification code was already used. Wait for a new code and try again."
    ,mfaChallengeExpiredError: "The sign-in verification period expired. Sign in with your password again."
    ,mfaRateLimitedError: "Too many verification attempts. Try again shortly."
    ,authSessionCreateFailedError: "The sign-in session could not be created. Try again."
    ,authMethodUnavailableError: "This verification method is temporarily unavailable. Try again."
    ,authInternalError: "Sign-in could not be completed. Try again."
    ,mfaRememberDevice: "Trust this device for 30 days"
    ,mfaManualKey: "Manual setup key"
    ,mfaShowSecret: "Show setup key"
    ,mfaHideSecret: "Hide setup key"
    ,mfaCopySecret: "Copy setup key"
    ,mfaRecoveryCodes: "Recovery codes"
    ,mfaRecoveryWarning: "Store these codes securely. Each code can be used only once."
    ,mfaBackToLogin: "Back to sign in"
    ,security: "Security"
    ,mfaSecurityDescription: "Manage two-step verification, recovery codes, and trusted devices."
    ,mfaEnabled: "Enabled and protecting your account"
    ,mfaDisabled: "Not enabled"
    ,mfaPendingVerification: "Pending verification"
    ,mfaLocked: "Locked"
    ,mfaRequiresReverification: "Re-verification required"
    ,mfaEnable: "Enable"
    ,mfaConfirmEnable: "Confirm setup"
    ,mfaDisable: "Disable two-step verification"
    ,mfaDisableConfirm: "Two-step verification will be disabled and all sessions will be signed out. Continue?"
    ,mfaEnabledSuccess: "Two-step verification is enabled."
    ,mfaRecoveryRemaining: "Single-use codes remaining: {count}"
    ,mfaCopyCodes: "Copy codes"
    ,mfaRecoveryCopied: "Recovery codes were copied and will be cleared from the clipboard after 60 seconds. Store them securely."
    ,mfaSecretCopied: "The setup key was copied and will be cleared from the clipboard after 60 seconds."
    ,mfaRegenerate: "Regenerate codes"
    ,mfaActiveSessions: "Active sessions"
    ,mfaCurrentSession: "Current session"
    ,mfaNoActiveSessions: "No active sessions."
    ,mfaLogoutEverywhere: "Sign out everywhere"
    ,mfaLogoutEverywhereConfirm: "All web and mobile sessions will be signed out. Continue?"
    ,mfaRevokeSessionConfirm: "This session will be signed out. Continue?"
    ,mfaTrustedDevices: "Trusted devices"
    ,mfaRevokeDeviceConfirm: "Trust will be removed from this device. Continue?"
    ,mfaUnknownDevice: "Unknown device"
    ,mfaNoTrustedDevices: "No trusted devices."
    ,mfaLoginSecurity: "Sign-in security"
    ,mfaSummaryPasswordOnly: "Password only"
    ,mfaSummaryTotp: "Authenticator enabled"
    ,mfaSummaryEmail: "Email verification enabled"
    ,mfaSummaryBoth: "Authenticator and email verification enabled"
    ,mfaPreferredMethod: "Preferred method"
    ,mfaPreferredMethodTitle: "Preferred verification method"
    ,mfaPreferredDescription: "Choose the method shown first during sign-in. You can always switch to another enabled method."
    ,mfaPreferredUpdated: "Preferred verification method was updated."
    ,mfaDisableMethod: "Disable"
    ,mfaVerificationCode: "Verification code"
    ,mfaSendEmailCode: "Send email code"
    ,mfaEmailCodeSent: "A verification code was sent to your email."
    ,mfaEmailEnabledSuccess: "Email verification was enabled."
    ,mfaPolicyCompliant: "Your account complies with the workspace security policy."
    ,mfaPolicyActionRequired: "Enable the security method required by your workspace before continuing."
    ,verifyEmailTitle: "Verify your email address"
    ,verifyEmailTrialDescription: "Your 7-day trial starts automatically when the first WhatsApp connection succeeds."
    ,resendVerificationEmail: "Resend verification email"
    ,verificationEmailSent: "Verification email sent."
    ,emailAlreadyVerified: "Your email address is already verified."
    ,trialReadyTitle: "Your 7-day trial is ready"
    ,trialReadyDescription: "Your trial starts when your WhatsApp account connects successfully for the first time."
    ,userSeats: "Accounts"
    ,whatsappConnections: "WhatsApp connections"
    ,trialIneligibleTitle: "Free trial already used"
    ,trialIdentityUsedDescription: "This WhatsApp account has already used its free trial. Select a paid plan to continue."
    ,trialReviewTitle: "Trial eligibility under review"
    ,trialReviewDescription: "Your trial eligibility requires a security review. You can still purchase a paid plan."
    ,selectCountry: "Select country"
    ,searchCountry: "Search countries"
    ,searchCountryPlaceholder: "Search by country, calling code, or ISO"
    ,internationalPhoneInvalid: "Enter a valid phone number for the selected country."
    ,phoneCountryUnsupported: "Phone-code pairing is not yet supported for this country."
    ,phoneCountryCodeDuplicate: "Do not enter the country calling code again in the phone field."
    ,starterAttributionNotice: "Messages sent on branded plans automatically include LOGIVYA attribution."
    ,starterAttributionLengthExceeded: "To reserve space for plan attribution, the message can be at most {max} characters."
    ,billingMonthly: "Monthly"
    ,billingYearly: "Yearly"
    ,pricePerMonth: "Monthly"
    ,pricePerYear: "Yearly"
    ,monthlyEquivalent: "Monthly equivalent {price}"
    ,trialSevenDays: "7 days free"
    ,freeBadge: "Free"
    ,planTrialName: "Logivya Free for 7 Days"
    ,planStarterName: "Logivya Plus"
    ,planProfessionalName: "Logivya Pro"
    ,planStarterDescription: "A strong starting plan for logistics listings, messaging, contacts, and group management."
    ,planProfessionalDescription: "A professional plan for high-volume logistics operations, advanced messaging, and ad-free use."
    ,planFeaturesLabel: "Plan features"
    ,planFeatureAccounts: "{count} Accounts"
    ,planFeatureBranded: "Ad-supported messaging"
    ,planFeatureUnbranded: "Ad-free messaging"
    ,planFeatureContacts: "Message your contacts"
    ,planFeatureGroups: "Message your groups"
    ,planFeatureScheduledRecurring: "Scheduled and recurring messages"
    ,planFeatureDeleteEveryone: "Delete for Everyone"
    ,planFeatureAdvancedSupport: "Advanced support"
    ,planFeatureTrialDays: "{count}-day free trial"
    ,chooseStarter: "Choose LOGIVYA Plus"
    ,chooseProfessional: "Choose LOGIVYA Pro"
    ,accountsUsed: "{used} / {limit} accounts in use"
    ,directUserFieldsRequired: "Enter a first name, last name, valid email, and a temporary password that meets the password policy."
    ,firstNameRequiredError: "Enter the first name."
    ,lastNameRequiredError: "Enter the last name."
    ,nameFieldsRequiredError: "Enter the first and last name."
    ,emailNotAvailableError: "This email address is already used by another account."
    ,userCreated: "User created. Share the temporary credentials securely. The user must change the password on first sign-in."
    ,userCreateFailed: "The user could not be created."
    ,userReactivated: "The user was reactivated."
    ,userSuspended: "The user was suspended."
    ,temporaryPasswordReset: "The temporary password was reset and the user's existing sessions were revoked."
    ,temporaryPasswordResetFailed: "The temporary password could not be reset."
    ,directUsersDescription: "Add and manage users linked to your account."
    ,accountUsage: "Account usage"
    ,addNewUser: "Add New User"
    ,addNewUserDescription: "Create sign-in credentials for the new user."
    ,firstName: "First name"
    ,lastName: "Last name"
    ,temporaryPassword: "Temporary Password"
    ,createUser: "Create User"
    ,noAvailableAccounts: "There are no available account seats in your plan."
    ,resetTemporaryPassword: "Create Temporary Password"
    ,saveTemporaryPassword: "Save Temporary Password"
    ,passwordChangePending: "Password Change Pending"
    ,currentUser: "Current user"
    ,reactivateUser: "Reactivate"
    ,suspendUser: "Suspend"
    ,passwordChangeTitle: "Change your password"
    ,passwordChangeDescription: "For your security, you must change your temporary password on first sign-in."
    ,newPasswordConfirmation: "Confirm New Password"
    ,changePasswordAndContinue: "Change Password and Continue"
    ,temporaryPasswordInvalid: "The temporary password is invalid."
    ,passwordReuseNotAllowed: "The new password cannot be the same as the temporary password."
    ,passwordChangeExpired: "The password-change session expired. Sign in again with your temporary password."
  }
} as const;

export type TranslationKey = keyof typeof baseTranslations.tr;

type TranslationVariables = Record<string, string | number>;
type TranslationDictionary = Record<TranslationKey, string>;

export const translations: Record<Locale, TranslationDictionary> = {
  tr: baseTranslations.tr as unknown as TranslationDictionary,
  en: baseTranslations.en as unknown as TranslationDictionary,
  ar: arDictionary as TranslationDictionary,
  ro: roDictionary as TranslationDictionary,
  ru: ruDictionary as TranslationDictionary,
  az: azDictionary as TranslationDictionary,
  tk: tkDictionary as TranslationDictionary,
  de: deDictionary as TranslationDictionary,
  bg: bgDictionary as TranslationDictionary,
  el: elDictionary as TranslationDictionary,
  sr: srDictionary as TranslationDictionary,
};

export function translate(locale: string, key: TranslationKey, variables: TranslationVariables = {}) {
  const resolvedLocale = normalizeLocale(locale) ?? fallbackLocale;
  const dictionary = translations[resolvedLocale];
  const template = dictionary[key] ?? translations.en[key];
  const intlLocale = localeMetadata[resolvedLocale].intlLocale;

  return Object.entries(variables).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, typeof value === "number" ? new Intl.NumberFormat(intlLocale).format(value) : String(value)),
    String(template),
  );
}
