import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const supportedTargetLocales = ["ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr", "uz"];
const requestedTargetLocales = process.env.L10N_TARGET_LOCALES?.split(",").map((locale) => locale.trim()).filter(Boolean);
const targetLocales = requestedTargetLocales?.length ? requestedTargetLocales : supportedTargetLocales;
if (targetLocales.some((locale) => !supportedTargetLocales.includes(locale))) throw new Error("L10N_TARGET_LOCALES contains an unsupported locale");
const googleLocale = { ar: "ar", ro: "ro", ru: "ru", az: "az", tk: "tk", de: "de", bg: "bg", el: "el", sr: "sr", uz: "uz" };
const batchSize = Math.max(1, Math.min(10, Number(process.env.L10N_BATCH_SIZE) || 4));
const concurrency = Math.max(1, Math.min(3, Number(process.env.L10N_CONCURRENCY) || 3));
const requestDelay = Math.max(0, Number(process.env.L10N_REQUEST_DELAY_MS) || 0);
const cachePath = path.join(root, ".cache", "localization-catalogs.json");
let translationCache = {};
let bingSession = null;
let bingRequestCounter = 0;

const curatedTerms = {
  ar: {
    Dashboard: "لوحة التحكم", Accounts: "الحسابات", Groups: "المجموعات", Categories: "الفئات",
    "Send Message": "إرسال رسالة", "Message History": "سجل الرسائل", Support: "الدعم", Settings: "الإعدادات",
    Subscriptions: "الاشتراكات", Contacts: "جهات الاتصال", Users: "المستخدمون", Companies: "الشركات",
    Connected: "متصل", "Not connected": "غير متصل", Active: "نشط", Pending: "قيد الانتظار",
    Save: "حفظ", Delete: "حذف", Edit: "تعديل", Cancel: "إلغاء", Search: "بحث", "Try again": "إعادة المحاولة",
  },
  ro: {
    "Monthly equivalent {price}": "Echivalent lunar {price}",
    "{count} Accounts": "{count} conturi",
    "{count}-day free trial": "{count} zile de probă gratuită",
    Dashboard: "Panou de control", Accounts: "Conturi", Groups: "Grupuri", Categories: "Categorii",
    "Send Message": "Trimite mesaj", "Message History": "Istoric mesaje", Support: "Asistență", Settings: "Setări",
    Subscriptions: "Abonamente", Contacts: "Contacte", Users: "Utilizatori", Companies: "Companii",
    Connected: "Conectat", "Not connected": "Neconectat", Connecting: "Se conectează", Reconnecting: "Se reconectează",
    Active: "Activ", Pending: "În așteptare", Failed: "Eșuat", Completed: "Finalizat", Cancelled: "Anulat",
    Trial: "Perioadă de probă", Professional: "Profesional", Admin: "Administrator", Save: "Salvează",
    Delete: "Șterge", Edit: "Editează", Cancel: "Anulează", Search: "Caută", "Try again": "Încearcă din nou",
  },
  ru: {
    "Monthly equivalent {price}": "Эквивалент в месяц: {price}",
    "{count} Accounts": "{count} аккаунтов",
    "{count}-day free trial": "{count} дней бесплатного пробного периода",
    Dashboard: "Панель управления", Accounts: "Аккаунты", Groups: "Группы", Categories: "Категории",
    "Send Message": "Отправить сообщение", "Message History": "История сообщений", Support: "Поддержка", Settings: "Настройки",
    Subscriptions: "Подписки", Contacts: "Контакты", Users: "Пользователи", Companies: "Компании",
    Connected: "Подключено", "Not connected": "Не подключено", Connecting: "Подключение", Reconnecting: "Повторное подключение",
    Active: "Активно", Pending: "Ожидает", Failed: "Ошибка", Completed: "Завершено", Cancelled: "Отменено",
    Trial: "Пробный период", Professional: "Профессиональный", Admin: "Администратор", Save: "Сохранить",
    Delete: "Удалить", Edit: "Изменить", Cancel: "Отмена", Search: "Поиск", "Try again": "Повторить",
  },
  az: {
    "Authenticator app": "Doğrulayıcı tətbiqi",
    "Monthly equivalent {price}": "Aylıq ekvivalent {price}",
    "{count} Accounts": "{count} hesab",
    "{count}-day free trial": "{count} günlük pulsuz sınaq",
    Dashboard: "İdarəetmə paneli", Accounts: "Hesablar", Groups: "Qruplar", Categories: "Kateqoriyalar",
    "Send Message": "Mesaj göndər", "Message History": "Mesaj tarixçəsi", Support: "Dəstək", Settings: "Parametrlər",
    Subscriptions: "Abunəliklər", Contacts: "Kontaktlar", Users: "İstifadəçilər", Companies: "Şirkətlər",
    Connected: "Qoşulub", "Not connected": "Qoşulmayıb", Connecting: "Qoşulur", Reconnecting: "Yenidən qoşulur",
    Active: "Aktiv", Pending: "Gözləyir", Failed: "Uğursuz", Completed: "Tamamlandı", Cancelled: "Ləğv edildi",
    Trial: "Sınaq", Professional: "Peşəkar", Admin: "İnzibatçı", Save: "Yadda saxla",
    Delete: "Sil", Edit: "Redaktə et", Cancel: "Ləğv et", Search: "Axtar", "Try again": "Yenidən cəhd et",
  },
  tk: {
    "Monthly equivalent {price}": "Aýlyk ekwiwalent {price}",
    "{count} Accounts": "{count} hasap",
    "{count}-day free trial": "{count} günlük mugt synag",
    Dashboard: "Dolandyryş paneli", Accounts: "Hasaplar", Groups: "Toparlar", Categories: "Kategoriýalar",
    "Send Message": "Habar iber", "Message History": "Habar taryhy", Support: "Goldaw", Settings: "Sazlamalar",
    Subscriptions: "Abunalyklar", Contacts: "Aragatnaşyklar", Users: "Ulanyjylar", Companies: "Kompaniýalar",
    Connected: "Birikdirildi", "Not connected": "Birikdirilmedi", Connecting: "Birikdirilýär", Reconnecting: "Gaýtadan birikdirilýär",
    Active: "Işjeň", Pending: "Garaşylýar", Failed: "Şowsuz", Completed: "Tamamlandy", Cancelled: "Ýatyryldy",
    Trial: "Synag", Professional: "Professional", Admin: "Dolandyryjy", Save: "Ýatda sakla",
    Delete: "Poz", Edit: "Üýtget", Cancel: "Ýatyr", Search: "Gözle", "Try again": "Gaýtadan synanyş",
  },
  de: {
    "Monthly equivalent {price}": "Monatlicher Gegenwert {price}",
    "{count} Accounts": "{count} Konten",
    "{count}-day free trial": "{count} Tage kostenlos testen",
    Dashboard: "Übersicht", Accounts: "Konten", Groups: "Gruppen", Categories: "Kategorien",
    "Send Message": "Nachricht senden", "Message History": "Nachrichtenverlauf", Support: "Support", Settings: "Einstellungen",
    Subscriptions: "Abonnements", Contacts: "Kontakte", Users: "Benutzer", Companies: "Unternehmen",
    Connected: "Verbunden", "Not connected": "Nicht verbunden", Connecting: "Verbindung wird hergestellt", Reconnecting: "Verbindung wird wiederhergestellt",
    Active: "Aktiv", Pending: "Ausstehend", Failed: "Fehlgeschlagen", Completed: "Abgeschlossen", Cancelled: "Storniert",
    Trial: "Testphase", Professional: "Professional", Admin: "Administrator", Save: "Speichern",
    Delete: "Löschen", Edit: "Bearbeiten", Cancel: "Abbrechen", Search: "Suchen", "Try again": "Erneut versuchen",
  },
  bg: {
    "Monthly equivalent {price}": "Месечен еквивалент {price}",
    "{count} Accounts": "{count} акаунта",
    "{count}-day free trial": "{count} дни безплатен пробен период",
    Dashboard: "Табло за управление", Accounts: "Акаунти", Groups: "Групи", Categories: "Категории",
    "Send Message": "Изпращане на съобщение", "Message History": "История на съобщенията", Support: "Поддръжка", Settings: "Настройки",
    Subscriptions: "Абонаменти", Contacts: "Контакти", Users: "Потребители", Companies: "Компании",
    Connected: "Свързан", "Not connected": "Няма връзка", Connecting: "Свързване", Reconnecting: "Повторно свързване",
    Active: "Активен", Pending: "Изчаква", Failed: "Неуспешно", Completed: "Завършено", Cancelled: "Отменено",
    Trial: "Пробен период", Professional: "Професионален", Admin: "Администратор", Save: "Запазване",
    Delete: "Изтриване", Edit: "Редактиране", Cancel: "Отказ", Search: "Търсене", "Try again": "Опитайте отново",
  },
  el: {
    Disable: "Απενεργοποίηση",
    "Monthly equivalent {price}": "Μηνιαίο ισοδύναμο {price}",
    "{count} Accounts": "{count} λογαριασμοί",
    "{count}-day free trial": "{count} ημέρες δωρεάν δοκιμή",
    Dashboard: "Πίνακας ελέγχου", Accounts: "Λογαριασμοί", Groups: "Ομάδες", Categories: "Κατηγορίες",
    "Send Message": "Αποστολή μηνύματος", "Message History": "Ιστορικό μηνυμάτων", Support: "Υποστήριξη", Settings: "Ρυθμίσεις",
    Subscriptions: "Συνδρομές", Contacts: "Επαφές", Users: "Χρήστες", Companies: "Εταιρείες",
    Connected: "Συνδεδεμένο", "Not connected": "Μη συνδεδεμένο", Connecting: "Γίνεται σύνδεση", Reconnecting: "Γίνεται επανασύνδεση",
    Active: "Ενεργό", Pending: "Σε αναμονή", Failed: "Απέτυχε", Completed: "Ολοκληρώθηκε", Cancelled: "Ακυρώθηκε",
    Trial: "Δοκιμαστική περίοδος", Professional: "Επαγγελματικό", Admin: "Διαχειριστής", Save: "Αποθήκευση",
    Delete: "Διαγραφή", Edit: "Επεξεργασία", Cancel: "Ακύρωση", Search: "Αναζήτηση", "Try again": "Δοκιμάστε ξανά",
  },
  sr: {
    "A verification code was sent to {email}.": "Verifikacioni kod je poslat na {email}.",
    "Marketplace listing report: {title}": "Prijava oglasa na tržištu: {title}",
    "Load, vehicle, and driver listings published by {name} will be hidden for your account on this device. Continue?": "Oglasi za teret, vozila i vozače koje je objavio/la {name} biće sakriveni za vaš nalog na ovom uređaju. Nastaviti?",
    "{groups} groups · {messages} messages · {matches} results": "{groups} grupa · {messages} poruka · {matches} rezultata",
    "Found in {count} sources": "Pronađeno u {count} izvora",
    "You can select up to {{max}} files per send.": "Možete izabrati najviše {{max}} datoteka po slanju.",
    "{{count}} files selected": "Izabrano datoteka: {{count}}",
    "A load matching your {requestTitle} request was found.": "Pronađen je teret koji odgovara zahtevu {requestTitle}.",
    "A vehicle matching your {requestTitle} request was found.": "Pronađeno je vozilo koje odgovara zahtevu {requestTitle}.",
    "A driver listing matching your {requestTitle} request was found.": "Pronađen je oglas za vozača koji odgovara zahtevu {requestTitle}.",
    "Monthly equivalent {price}": "Mesečni ekvivalent {price}",
    "{count} Accounts": "{count} naloga",
    "{count}-day free trial": "{count} dana besplatnog probnog perioda",
    Dashboard: "Kontrolna tabla", Accounts: "Nalozi", Groups: "Grupe", Categories: "Kategorije",
    "Send Message": "Pošalji poruku", "Message History": "Istorija poruka", Support: "Podrška", Settings: "Podešavanja",
    Subscriptions: "Pretplate", Contacts: "Kontakti", Users: "Korisnici", Companies: "Kompanije",
    Connected: "Povezano", "Not connected": "Nije povezano", Connecting: "Povezivanje", Reconnecting: "Ponovno povezivanje",
    Active: "Aktivno", Pending: "Na čekanju", Failed: "Neuspešno", Completed: "Završeno", Cancelled: "Otkazano",
    Trial: "Probni period", Professional: "Profesionalni", Admin: "Administrator", Save: "Sačuvaj",
    Delete: "Obriši", Edit: "Izmeni", Cancel: "Otkaži", Search: "Pretraži", "Try again": "Pokušaj ponovo",
    "Communication center": "Centar za komunikaciju",
    "Manage account, security, support, and operational notifications in one place.": "Upravljajte obaveštenjima o nalogu, bezbednosti, podršci i operacijama na jednom mestu.",
    "Notification preferences": "Podešavanja obaveštenja",
    "Choose your channels while mandatory security notifications remain protected.": "Izaberite kanale dok obavezna bezbednosna obaveštenja ostaju zaštićena.",
    "Notification preferences saved.": "Podešavanja obaveštenja su sačuvana.",
    "Notification preferences could not be saved.": "Podešavanja obaveštenja nisu mogla biti sačuvana.",
    "Mark as read": "Označi kao pročitano",
    "Mandatory notification": "Obavezno obaveštenje",
    Immediate: "Odmah",
    "Daily digest": "Dnevni pregled",
    "Weekly digest": "Nedeljni pregled",
    "Quiet hours start": "Početak perioda bez obaveštenja",
    "Quiet hours end": "Kraj perioda bez obaveštenja",
    "View all notifications": "Prikaži sva obaveštenja",
    "Browser notifications": "Obaveštenja pregledača",
    "Receive important Logivya notifications in this browser after you grant permission.": "Primajte važna Logivya obaveštenja u ovom pregledaču nakon što date dozvolu.",
    "Enable web notifications": "Omogući veb obaveštenja",
    "Disable web notifications": "Onemogući veb obaveštenja",
    "Web notifications are enabled for this browser.": "Veb obaveštenja su omogućena za ovaj pregledač.",
    "Web notifications are disabled for this browser.": "Veb obaveštenja su onemogućena za ovaj pregledač.",
    "Web notifications are unavailable in this browser or server configuration.": "Veb obaveštenja nisu dostupna u ovom pregledaču ili konfiguraciji servera.",
    "Browser notification permission was not granted. You can change it in browser settings.": "Dozvola za obaveštenja pregledača nije odobrena. Možete je promeniti u podešavanjima pregledača.",
    "Web notifications could not be enabled.": "Veb obaveštenja nisu mogla biti omogućena.",
    "Web notifications could not be disabled.": "Veb obaveštenja nisu mogla biti onemogućena.",
    "In-app": "U aplikaciji",
    "Android push": "Android prosleđeno obaveštenje",
    "iOS push": "iOS prosleđeno obaveštenje",
    "Web push": "Veb prosleđeno obaveštenje",
    Invitation: "Pozivnica",
    Administration: "Administracija",
    Backup: "Rezervna kopija",
    Incident: "Vanredni događaj",
    "Platform announcement": "Obaveštenje platforme",
    "Create a draft, review its exact audience and channels, then explicitly approve publication.": "Kreirajte nacrt, pregledajte tačnu publiku i kanale, zatim izričito odobrite objavljivanje.",
    "Internal deep link (optional)": "Interna dubinska veza (opciono)",
    Channels: "Kanali",
    "Start time": "Vreme početka",
    "End time (optional)": "Vreme završetka (opciono)",
    "Create draft": "Kreiraj nacrt",
    "Preview and publish": "Pregledaj i objavi",
    "No announcement drafts yet.": "Još nema nacrta obaveštenja.",
    "Unresolved dead letters": "Nerešene trajne greške",
    "Retry only after the underlying provider or configuration issue is repaired.": "Ponovite pokušaj tek nakon što otklonite problem dobavljača ili konfiguracije.",
    Event: "Događaj",
    Channel: "Kanal",
    Error: "Greška",
    Attempts: "Pokušaji",
    "No unresolved dead letters.": "Nema nerešenih trajnih grešaka.",
    "Versioned notification templates": "Verzionisani šabloni obaveštenja",
    "New versions begin as drafts and require explicit administrator approval.": "Nove verzije počinju kao nacrti i zahtevaju izričito odobrenje administratora.",
    "Template name": "Naziv šablona",
    "Email subject": "Tema e-pošte",
    "Message body with {{variable}} placeholders": "Tekst poruke sa čuvarima mesta {{variable}}",
    "Required variables, comma separated": "Obavezne promenljive, odvojene zarezom",
    Preview: "Pregled",
    "Test myself": "Testiraj na mom nalogu",
    "No versioned templates yet. Code fallbacks remain active.": "Još nema verzionisanih šablona. Rezervne vrednosti iz koda ostaju aktivne.",
    "Provider readiness": "Spremnost dobavljača",
    "Only safe configuration metadata is shown. Credentials are never returned.": "Prikazuju se samo bezbedni metapodaci konfiguracije. Akreditivi se nikada ne vraćaju.",
    "Announcement draft created.": "Nacrt obaveštenja je kreiran.",
    "Announcement draft could not be created.": "Nacrt obaveštenja nije mogao biti kreiran.",
    "The announcement preview is no longer current.": "Pregled obaveštenja više nije aktuelan.",
    "Continue to the controlled publication confirmation?": "Nastaviti na kontrolisanu potvrdu objavljivanja?",
    "Type exactly": "Unesite tačno",
    "The confirmation text does not match.": "Tekst potvrde se ne podudara.",
    "Large audience confirmation": "Potvrda velike publike",
    "The announcement could not be published.": "Obaveštenje nije moglo biti objavljeno.",
    "Announcement queued for recipients": "Obaveštenje je stavljeno u red za primaoce",
    "Enter the cancellation reason (at least 5 characters).": "Unesite razlog otkazivanja (najmanje 5 znakova).",
    "Announcement canceled.": "Obaveštenje je otkazano.",
    "The announcement could not be canceled.": "Obaveštenje nije moglo biti otkazano.",
    "Describe the repaired cause before retrying (at least 5 characters).": "Opišite otklonjeni uzrok pre ponovnog pokušaja (najmanje 5 znakova).",
    "Delivery queued for a safe retry.": "Isporuka je stavljena u red za bezbedan ponovni pokušaj.",
    "The delivery could not be queued for retry.": "Isporuka nije mogla biti stavljena u red za ponovni pokušaj.",
    "Template draft created.": "Nacrt šablona je kreiran.",
    "The template draft could not be created.": "Nacrt šablona nije mogao biti kreiran.",
    "Template approved and activated.": "Šablon je odobren i aktiviran.",
    "The template could not be approved.": "Šablon nije mogao biti odobren.",
    "The template preview could not be generated.": "Pregled šablona nije mogao biti napravljen.",
    "Send a controlled test only to your administrator account?": "Poslati kontrolisani test samo na vaš administratorski nalog?",
    "The controlled test was sent to your administrator account.": "Kontrolisani test je poslat na vaš administratorski nalog.",
    "The controlled test could not be sent.": "Kontrolisani test nije mogao biti poslat.",
    "Choose the channels you want to use for each notification category.": "Izaberite kanale koje želite da koristite za svaku kategoriju obaveštenja.",
    "Your notification preferences were saved.": "Vaša podešavanja obaveštenja su sačuvana.",
    "In app": "U aplikaciji",
    "Required notification": "Obavezno obaveštenje",
    Invitations: "Pozivnice",
    Messages: "Poruke",
    Incidents: "Vanredni događaji",
    "Android notification permission": "Dozvola za Android obaveštenja",
    "Manage notification permission and device registration.": "Upravljajte dozvolom za obaveštenja i registracijom uređaja.",
    "Allow Android notifications to receive WhatsApp connection, support reply, security, and subscription updates on time.": "Dozvolite Android obaveštenja da biste na vreme primali ažuriranja o WhatsApp vezi, odgovorima podrške, bezbednosti i pretplati.",
    "Enable notifications": "Omogući obaveštenja",
    "Notifications enabled": "Obaveštenja su omogućena",
    "Notifications disabled": "Obaveštenja su onemogućena",
    "Notification permission was not granted. You can enable it in Android settings.": "Dozvola za obaveštenja nije odobrena. Možete je omogućiti u Android podešavanjima.",
  },
};

const curatedMobileOverrides = {
  ar: {},
  ro: {
    planFeatureTrialDays: "{count} zile de probă gratuită",
    notificationChannelAndroid: "Notificare Android",
    notificationChannelIos: "Notificare iOS",
    notificationChannelWeb: "Notificare web",
    roleSuperAdmin: "Superadministrator",
    feedbackTitle: "Feedback Logivya",
    district: "Județ",
    driverEmploymentCONTRACT: "Pe bază de contract",
    ok: "Confirmă",
    freightTrailerVan: "Furgon",
  },
  ru: {
    planFeatureTrialDays: "{count} дней бесплатного пробного периода",
    notificationChannelAndroid: "Уведомление Android",
    notificationChannelIos: "Уведомление iOS",
    notificationChannelWeb: "Веб-уведомление",
  },
  az: {
    planFeatureTrialDays: "{count} günlük pulsuz sınaq",
    notificationChannelAndroid: "Android bildirişi",
    notificationChannelIos: "iOS bildirişi",
    roleSuperAdmin: "Super inzibatçı",
    availableFrom: "Başlanğıc tarixi",
    logisticsMarketplace: "Logivya Logistika Bazarı",
    driverMarketplace: "Sürücü Bazarı",
    driverEmploymentPART_TIME: "Natamam iş vaxtı",
    ok: "Oldu",
  },
  tk: {
    planFeatureTrialDays: "{count} günlük mugt synag",
    retry: "Gaýtadan synan",
    ticketBilling: "Hasaplaşyk",
    notificationChannelInApp: "Programmada",
    notificationChannelWeb: "Web habarnamasy",
    notificationCategoryBilling: "Hasaplaşyk",
    notificationImmediate: "Derrew",
    privacyRightsRequest: "Maglumat hukuklary haýyşy",
    submitDeletionRequest: "Pozmak haýyşyny iber",
    adminBillingModule: "Hasaplaşyk moduly",
    sent: "Iberildi",
    emailSent: "Iberildi",
    roleAdmin: "Dolandyryjy",
    roleSuperAdmin: "Baş dolandyryjy",
    matchScore: "{count}% laýyklyk",
    description: "Düşündiriş",
    driverLocationRequired: "Dogry ýerleşişi giriziň.",
    driverLicenseRequired: "Iň bolmanda bir sürüjilik şahadatnamasynyň synpyny saýlaň.",
    driverExperienceInvalid: "Tejribe 0 bilen 60 ýylyň arasynda bolmaly.",
    publishDriverListing: "Sürüji bildirişini çap et",
    driverPublishedTitle: "Sürüji bildirişi çap edildi",
    driverPublishedDescription: "Bildirişiňiz indi Sürüji bazarynda işjeň.",
    driverCreateFailed: "Sürüji bildirişini döredip bolmady.",
    driverSearchFailed: "Sürüji bildirişlerini ýükläp bolmady.",
    driverDetailFailed: "Sürüji bildirişiniň jikme-jikliklerini ýükläp bolmady.",
    driverUpdateFailed: "Sürüji bildirişini täzeläp bolmady.",
    driverUpdated: "Sürüji bildirişindäki üýtgeşmeler ýatda saklandy.",
    driverListing: "Sürüji bildirişi",
    editDriverListing: "Sürüji bildirişini üýtget",
    editDriverListingDescription: "Bildirişiň ýerleşişini, hünär talaplaryny we aragatnaşyk maglumatlaryny täzeläň.",
    availableDrivers: "Elýeterli sürüjiler",
    driverJobListings: "Sürüji iş bildirişleri",
    noDriversFound: "Gabat gelýän sürüji bildirişi tapylmady",
    noDriversFoundDescription: "Ýerleşiş ýa-da hünär süzgüçlerini üýtgedip, gaýtadan synanyşyň.",
    myListingsUnifiedDescription: "Ýük, ulag we sürüji bildirişlerini bir ýerde üýtgediň we ýagdaýlaryny dolandyryň.",
    listingType: "Bildiriş görnüşi",
    status: "Ýagdaý",
    noListingsInThisSection: "Bu bölümde bildiriş ýok",
    noListingsInThisSectionDescription: "Täze bildiriş dörediň ýa-da başga görnüşi we ýagdaýy saýlaň.",
    saved: "Ýatda saklandy",
    ok: "Bolýar",
    loading: "Ýüklenýär",
  },
  de: {
    planFeatureTrialDays: "{count} Tage kostenlos testen",
    availableFromOptional: "Beginn (optional)",
    pauseDemand: "Pausieren",
    screenshotUrl: "Screenshot-URL",
    liveApi: "Live-API",
    ok: "Bestätigen",
  },
  bg: {
    planFeatureTrialDays: "{count} дни безплатен пробен период",
    ok: "Добре",
  },
  el: {
    planFeatureTrialDays: "{count} ημέρες δωρεάν δοκιμή",
    pauseDemand: "Παύση",
    completeDemand: "Ολοκλήρωση",
    emailDelivery: "Παράδοση email: {status}",
    logisticsMarketplace: "Αγορά Logistics της Logivya",
    load: "Φορτίο",
    vehicleMarketplace: "Αγορά οχημάτων",
    driverMarketplace: "Αγορά οδηγών",
    findVehicle: "Εύρεση οχήματος",
    ok: "Εντάξει",
    loading: "Φόρτωση",
  },
  sr: {
    planFeatureTrialDays: "{count} dana besplatnog probnog perioda",
    demandRequestCreatedWithMatches: "Vaš zahtev je aktivan i već je pronađeno {count} odgovarajućih oglasa.",
    matchScore: "{count}% podudaranje",
    notificationChannelEmail: "E-pošta",
    email: "E-pošta",
    emailDelivery: "Isporuka e-pošte: {status}",
    feedbackTitle: "Povratne informacije za Logivya",
    roleOperator: "Operater",
    driverMarketplace: "Tržište vozača",
    shareVehicle: "Objavi vozilo",
    findVehicle: "Pronađi vozilo",
    findDriver: "Pronađi vozača",
    description: "Opis",
    status: "Status oglasa",
    vehicleMarketplace: "Tržište vozila",
    driverListingTitle: "Naslov oglasa",
    ok: "U redu",
    loading: "Učitavanje",
  },
};

function normalizeRomanianTypography(value) {
  return value.replaceAll("Ş", "Ș").replaceAll("ş", "ș").replaceAll("Ţ", "Ț").replaceAll("ţ", "ț");
}

const curatedKeyOverrides = {
  ar: {},
  ro: {
    "notification.channel.android_push": "Notificare Android",
    "notification.channel.ios_push": "Notificare iOS",
    "notification.channel.web_push": "Notificare web",
    "notification.category.incident": "Incident de sistem",
    "notifications.admin.templateBody": "Corpul mesajului cu substituenți {{variable}}",
    "users.owner": "Proprietar",
    "adminUsers.superAdmin": "Superadministrator",
    "company.district": "Județ",
    "adminCampaigns.actor": "Autor",
    "home.plan.trial.description": "Încercați gratuit toate funcțiile esențiale Logivya timp de 7 zile.",
    "home.plan.trial.feature2": "Mesagerie cu marcaj promoțional",
    "home.plan.trial.feature4": "Șterge pentru toți",
    "home.plan.trial.feature5": "Trimiteți mesaje grupurilor și contactelor",
    "home.plan.starter.description": "Un plan practic pentru mesagerie esențială și administrarea grupurilor.",
    "home.plan.starter.feature2": "Mesagerie cu marcaj promoțional",
    "home.plan.starter.feature4": "Șterge pentru toți",
    "home.plan.starter.feature5": "Trimiteți mesaje grupurilor dvs.",
    "home.plan.professional.description": "Operațiuni profesionale de mesagerie, cu livrare fără reclame și instrumente avansate.",
    "home.plan.professional.feature2": "Mesagerie fără reclame",
    "home.plan.professional.feature3": "Trimiteți mesaje contactelor și grupurilor",
    "home.plan.professional.feature4": "Șterge pentru toți",
  },
  ru: {
    "notification.channel.android_push": "Уведомление Android",
    "notification.channel.ios_push": "Уведомление iOS",
    "notification.channel.web_push": "Веб-уведомление",
    "notifications.admin.templateBody": "Текст сообщения с заполнителями {{variable}}",
    "home.plan.trial.description": "Используйте все основные возможности Logivya бесплатно в течение 7 дней.",
    "home.plan.trial.feature2": "Сообщения с рекламной отметкой",
    "home.plan.trial.feature4": "Удаление у всех",
    "home.plan.trial.feature5": "Отправка сообщений группам и контактам",
    "home.plan.starter.description": "Практичный план для основных задач обмена сообщениями и управления группами.",
    "home.plan.starter.feature2": "Сообщения с рекламной отметкой",
    "home.plan.starter.feature4": "Удаление у всех",
    "home.plan.starter.feature5": "Отправка сообщений вашим группам",
    "home.plan.professional.description": "Профессиональная работа с сообщениями без рекламы и с расширенными инструментами.",
    "home.plan.professional.feature2": "Сообщения без рекламы",
    "home.plan.professional.feature3": "Отправка сообщений контактам и группам",
    "home.plan.professional.feature4": "Удаление у всех",
  },
  az: {
    "notification.channel.in_app": "Tətbiqdaxili",
    "notification.channel.android_push": "Android bildirişi",
    "notification.channel.ios_push": "iOS bildirişi",
    "notification.category.backup": "Ehtiyat nüsxə",
    "notifications.admin.templateBody": "{{variable}} yer tutucuları olan mesaj mətni",
    "adminUsers.superAdmin": "Super inzibatçı",
    "adminUsers.role.admin": "İnzibatçı",
    "home.plan.trial.description": "Logivya-nın bütün əsas imkanlarını 7 gün pulsuz sınayın.",
    "home.plan.trial.feature2": "Reklam qeydi ilə mesajlaşma",
    "home.plan.trial.feature4": "Hamı üçün silmə",
    "home.plan.trial.feature5": "Qruplara və kontaktlara mesaj göndərin",
    "home.plan.starter.description": "Əsas mesajlaşma və qrup idarəetməsi üçün praktik plan.",
    "home.plan.starter.feature2": "Reklam qeydi ilə mesajlaşma",
    "home.plan.starter.feature4": "Hamı üçün silmə",
    "home.plan.starter.feature5": "Qruplarınıza mesaj göndərin",
    "home.plan.professional.description": "Reklamsız çatdırılma və qabaqcıl alətlərlə peşəkar mesajlaşma əməliyyatları.",
    "home.plan.professional.feature2": "Reklamsız mesajlaşma",
    "home.plan.professional.feature3": "Kontaktlara və qruplara mesaj göndərin",
    "home.plan.professional.feature4": "Hamı üçün silmə",
  },
  tk: {
    "notifications.immediate": "Derrew",
    "notification.channel.in_app": "Programmada",
    "notification.channel.web_push": "Web habarnamasy",
    "notification.category.billing": "Hasaplaşyk",
    "notifications.admin.endTime": "Tamamlanýan wagt (islege bagly)",
    "notifications.admin.retry": "Gaýtadan synan",
    "notifications.admin.approve": "Tassykla",
    "notifications.admin.templateBody": "{{variable}} ýer eýeleri bilen habar teksti",
    "users.owner": "Eýe",
    "users.admin": "Dolandyryjy",
    "users.emailSent": "Iberildi",
    "adminUsers.superAdmin": "Baş dolandyryjy",
    "adminUsers.role.admin": "Dolandyryjy",
    "home.plan.trial.description": "Logivya-nyň ähli esasy mümkinçiliklerini 7 gün mugt synap görüň.",
    "home.plan.trial.feature2": "Mahabat belligi bilen habarlaşma",
    "home.plan.trial.feature4": "Hemmeler üçin pozmak",
    "home.plan.trial.feature5": "Toparlara we aragatnaşyklara habar iberiň",
    "home.plan.starter.description": "Esasy habarlaşma we topar dolandyryşy üçin amatly meýilnama.",
    "home.plan.starter.feature2": "Mahabat belligi bilen habarlaşma",
    "home.plan.starter.feature4": "Hemmeler üçin pozmak",
    "home.plan.starter.feature5": "Toparlaryňyza habar iberiň",
    "home.plan.professional.description": "Mahabatsyz iberiş we kämil gurallar bilen professional habarlaşma amallary.",
    "home.plan.professional.feature2": "Mahabatsyz habarlaşma",
    "home.plan.professional.feature3": "Aragatnaşyklara we toparlara habar iberiň",
    "home.plan.professional.feature4": "Hemmeler üçin pozmak",
  },
  de: {
    "notification.category.backup": "Datensicherung",
    "notifications.admin.templateBody": "Nachrichtentext mit {{variable}}-Platzhaltern",
    "users.owner": "Inhaber",
    "home.plan.trial.description": "Testen Sie alle wesentlichen Logivya-Funktionen 7 Tage lang kostenlos.",
    "home.plan.trial.feature2": "Nachrichten mit Werbehinweis",
    "home.plan.trial.feature4": "Für alle löschen",
    "home.plan.trial.feature5": "Nachrichten an Gruppen und Kontakte senden",
    "home.plan.starter.description": "Ein praxisnaher Tarif für grundlegende Nachrichten- und Gruppenverwaltung.",
    "home.plan.starter.feature2": "Nachrichten mit Werbehinweis",
    "home.plan.starter.feature4": "Für alle löschen",
    "home.plan.starter.feature5": "Nachrichten an Ihre Gruppen senden",
    "home.plan.professional.description": "Professionelle Nachrichtenprozesse mit werbefreiem Versand und erweiterten Werkzeugen.",
    "home.plan.professional.feature2": "Werbefreier Nachrichtenversand",
    "home.plan.professional.feature3": "Nachrichten an Kontakte und Gruppen senden",
    "home.plan.professional.feature4": "Für alle löschen",
  },
  bg: {
    "notifications.admin.templateBody": "Текст на съобщението със заместители {{variable}}",
    "home.plan.trial.description": "Изпробвайте безплатно всички основни възможности на Logivya за 7 дни.",
    "home.plan.trial.feature2": "Съобщения с рекламна маркировка",
    "home.plan.trial.feature4": "Изтриване за всички",
    "home.plan.trial.feature5": "Изпращане на съобщения до групи и контакти",
    "home.plan.starter.description": "Практичен план за основни съобщения и управление на групи.",
    "home.plan.starter.feature2": "Съобщения с рекламна маркировка",
    "home.plan.starter.feature4": "Изтриване за всички",
    "home.plan.starter.feature5": "Изпращане на съобщения до вашите групи",
    "home.plan.professional.description": "Професионални операции за съобщения без реклами и с разширени инструменти.",
    "home.plan.professional.feature2": "Съобщения без реклами",
    "home.plan.professional.feature3": "Изпращане на съобщения до контакти и групи",
    "home.plan.professional.feature4": "Изтриване за всички",
  },
  el: {
    "notifications.admin.templateBody": "Κείμενο μηνύματος με σύμβολα κράτησης θέσης {{variable}}",
    "home.plan.trial.description": "Δοκιμάστε δωρεάν όλες τις βασικές δυνατότητες του Logivya για 7 ημέρες.",
    "home.plan.trial.feature2": "Μηνύματα με διαφημιστική σήμανση",
    "home.plan.trial.feature4": "Διαγραφή για όλους",
    "home.plan.trial.feature5": "Αποστολή μηνυμάτων σε ομάδες και επαφές",
    "home.plan.starter.description": "Ένα πρακτικό πρόγραμμα για βασική ανταλλαγή μηνυμάτων και διαχείριση ομάδων.",
    "home.plan.starter.feature2": "Μηνύματα με διαφημιστική σήμανση",
    "home.plan.starter.feature4": "Διαγραφή για όλους",
    "home.plan.starter.feature5": "Αποστολή μηνυμάτων στις ομάδες σας",
    "home.plan.professional.description": "Επαγγελματικές λειτουργίες μηνυμάτων χωρίς διαφημίσεις και με προηγμένα εργαλεία.",
    "home.plan.professional.feature2": "Μηνύματα χωρίς διαφημίσεις",
    "home.plan.professional.feature3": "Αποστολή μηνυμάτων σε επαφές και ομάδες",
    "home.plan.professional.feature4": "Διαγραφή για όλους",
  },
  sr: {
    "notification.channel.email": "E-pošta",
    "notifications.admin.templateBody": "Tekst poruke sa čuvarima mesta {{variable}}",
    "auth.email": "E-pošta",
    "company.email": "E-pošta",
    "systemHealth.email": "E-pošta",
    "users.owner": "Vlasnik",
    "users.operator": "Operater",
    "adminUsers.role.operator": "Operater",
    "home.plan.trial.description": "Isprobajte sve ključne Logivya funkcije besplatno tokom 7 dana.",
    "home.plan.trial.feature2": "Poruke sa promotivnom oznakom",
    "home.plan.trial.feature4": "Obriši za sve",
    "home.plan.trial.feature5": "Slanje poruka grupama i kontaktima",
    "home.plan.starter.description": "Praktičan plan za osnovno slanje poruka i upravljanje grupama.",
    "home.plan.starter.feature2": "Poruke sa promotivnom oznakom",
    "home.plan.starter.feature4": "Obriši za sve",
    "home.plan.starter.feature5": "Slanje poruka vašim grupama",
    "home.plan.professional.description": "Profesionalne operacije slanja poruka bez reklama i sa naprednim alatima.",
    "home.plan.professional.feature2": "Poruke bez reklama",
    "home.plan.professional.feature3": "Slanje poruka kontaktima i grupama",
    "home.plan.professional.feature4": "Obriši za sve",
  },
};

const canonicalUserNamingOverrides = {
  ar: {
    web: {
      "home.plan.starter.name": "Logivya Plus",
      "home.plan.professional.name": "Logivya Pro",
      "home.plan.trial.feature1": "حساب واحد",
      "home.plan.starter.feature1": "حسابان",
      "home.plan.professional.feature1": "3 حسابات",
      "adminSubscriptions.seats": "المستخدمون",
      "users.usedSeats": "المستخدمون الحاليون",
      "auth.seatLimitReached": "لا توجد مقاعد مستخدمين متاحة في الشركة.",
      "api.error.seatLimitReached": "لقد وصلت إلى الحد الأقصى للمستخدمين في خطتك.",
      "email.teamInvitation.linkMessage": "مرحباً {name}، دعاك {inviter} إلى مساحة عمل {workspace}. تنتهي صلاحية الدعوة في {expiresAt}. يجب أن تفتح أنت فقط هذا الرابط الآمن ذي الاستخدام الواحد: {url}",
    },
    mobile: {
      seatsCount: "{used}/{limit} حسابات",
      userSeats: "الحسابات",
      invitedAt: "تاريخ الدعوة: {date}",
      planStarterName: "Logivya Plus",
      planProfessionalName: "Logivya Pro",
    },
  },
  ro: {
    web: {
      "home.plan.trial.feature1": "1 cont",
      "home.plan.starter.feature1": "2 conturi",
      "home.plan.professional.feature1": "3 conturi",
      "adminSubscriptions.seats": "Utilizatori",
      "users.usedSeats": "Utilizatori folosiți",
      "auth.seatLimitReached": "Nu mai sunt locuri disponibile pentru utilizatori în companie.",
      "api.error.seatLimitReached": "Ați atins limita de utilizatori a planului.",
      "email.teamInvitation.linkMessage": "Bună {name}, {inviter} te-a invitat în spațiul de lucru {workspace}. Invitația expiră la {expiresAt}. Doar tu trebuie să deschizi acest link securizat de unică folosință: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} conturi", userSeats: "Conturi", invitedAt: "Invitat la: {date}" },
  },
  ru: {
    web: {
      "home.plan.trial.feature1": "1 аккаунт",
      "home.plan.starter.feature1": "2 аккаунта",
      "home.plan.professional.feature1": "3 аккаунта",
      "adminSubscriptions.seats": "Пользователи",
      "users.usedSeats": "Используемые пользователи",
      "auth.seatLimitReached": "В компании нет доступных мест для пользователей.",
      "api.error.seatLimitReached": "Достигнут лимит пользователей вашего тарифа.",
      "email.teamInvitation.linkMessage": "Здравствуйте, {name}. {inviter} приглашает вас в рабочее пространство {workspace}. Приглашение действительно до {expiresAt}. Только вы должны открыть эту одноразовую защищенную ссылку: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} аккаунтов", userSeats: "Аккаунты", invitedAt: "Приглашен: {date}" },
  },
  az: {
    web: {
      "home.plan.trial.feature1": "1 hesab",
      "home.plan.starter.feature1": "2 hesab",
      "home.plan.professional.feature1": "3 hesab",
      "adminSubscriptions.seats": "İstifadəçilər",
      "users.usedSeats": "İstifadə olunan istifadəçilər",
      "auth.seatLimitReached": "Şirkətdə istifadəçi yeri qalmayıb.",
      "api.error.seatLimitReached": "Planınızın istifadəçi limitinə çatmısınız.",
      "email.teamInvitation.linkMessage": "Salam {name}, {inviter} sizi {workspace} iş sahəsinə dəvət etdi. Bu dəvət {expiresAt} tarixinədək etibarlıdır. Birdəfəlik təhlükəsiz keçidi yalnız siz açın: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} hesab", userSeats: "Hesablar", invitedAt: "Dəvət tarixi: {date}" },
  },
  tk: {
    web: {
      "home.plan.trial.feature1": "1 hasap",
      "home.plan.starter.feature1": "2 hasap",
      "home.plan.professional.feature1": "3 hasap",
      "adminSubscriptions.seats": "Ulanyjylar",
      "users.usedSeats": "Ulanylýan ulanyjylar",
      "auth.seatLimitReached": "Kompaniýada ulanyjy ýeri galmady.",
      "api.error.seatLimitReached": "Meýilnamaňyzyň ulanyjy çägine ýetdiňiz.",
      "email.teamInvitation.linkMessage": "Salam {name}, {inviter} sizi {workspace} iş giňişligine çagyrdy. Çakylyk {expiresAt} çenli güýje girýär. Bir gezeklik ygtybarly baglanyşygy diňe siz açyň: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} hasap", userSeats: "Hasaplar", invitedAt: "Çagyrylan senesi: {date}" },
  },
  de: {
    web: {
      "home.plan.trial.feature1": "1 Konto",
      "home.plan.starter.feature1": "2 Konten",
      "home.plan.professional.feature1": "3 Konten",
      "adminSubscriptions.seats": "Benutzer",
      "users.usedSeats": "Verwendete Benutzer",
      "auth.seatLimitReached": "Im Unternehmen sind keine Benutzerplätze mehr verfügbar.",
      "api.error.seatLimitReached": "Sie haben das Benutzerlimit Ihres Tarifs erreicht.",
      "email.teamInvitation.linkMessage": "Hallo {name}, {inviter} hat Sie in den Arbeitsbereich {workspace} eingeladen. Diese Einladung ist bis {expiresAt} gültig. Nur Sie dürfen diesen einmalig verwendbaren sicheren Link öffnen: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} Konten", userSeats: "Konten", invitedAt: "Eingeladen: {date}" },
  },
  bg: {
    web: {
      "home.plan.trial.feature1": "1 акаунт",
      "home.plan.starter.feature1": "2 акаунта",
      "home.plan.professional.feature1": "3 акаунта",
      "adminSubscriptions.seats": "Потребители",
      "users.usedSeats": "Използвани потребители",
      "auth.seatLimitReached": "В компанията няма свободни места за потребители.",
      "api.error.seatLimitReached": "Достигнахте лимита на потребителите за плана.",
      "email.teamInvitation.linkMessage": "Здравейте, {name}. {inviter} ви покани в работното пространство {workspace}. Поканата е валидна до {expiresAt}. Само вие трябва да отворите тази еднократна защитена връзка: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} акаунта", userSeats: "Акаунти", invitedAt: "Поканен на: {date}" },
  },
  el: {
    web: {
      "home.plan.trial.feature1": "1 λογαριασμός",
      "home.plan.starter.feature1": "2 λογαριασμοί",
      "home.plan.professional.feature1": "3 λογαριασμοί",
      "adminSubscriptions.seats": "Χρήστες",
      "users.usedSeats": "Χρήστες σε χρήση",
      "auth.seatLimitReached": "Δεν υπάρχουν διαθέσιμες θέσεις χρηστών στην εταιρεία.",
      "api.error.seatLimitReached": "Έχετε φτάσει το όριο χρηστών του προγράμματός σας.",
      "email.teamInvitation.linkMessage": "Γεια σας {name}, ο χρήστης {inviter} σας προσκάλεσε στον χώρο εργασίας {workspace}. Η πρόσκληση ισχύει έως {expiresAt}. Μόνο εσείς πρέπει να ανοίξετε αυτόν τον ασφαλή σύνδεσμο μίας χρήσης: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} λογαριασμοί", userSeats: "Λογαριασμοί", invitedAt: "Πρόσκληση: {date}" },
  },
  sr: {
    web: {
      "home.plan.trial.feature1": "1 nalog",
      "home.plan.starter.feature1": "2 naloga",
      "home.plan.professional.feature1": "3 naloga",
      "adminSubscriptions.seats": "Korisnici",
      "users.usedSeats": "Korišćeni korisnici",
      "auth.seatLimitReached": "U kompaniji nema dostupnih mesta za korisnike.",
      "api.error.seatLimitReached": "Dostigli ste ograničenje broja korisnika za plan.",
      "email.teamInvitation.linkMessage": "Zdravo {name}, {inviter} vas je pozvao u radni prostor {workspace}. Poziv važi do {expiresAt}. Samo vi treba da otvorite ovu jednokratnu bezbednu vezu: {url}",
    },
    mobile: { seatsCount: "{used}/{limit} naloga", userSeats: "Nalozi", invitedAt: "Pozvan: {date}" },
  },
};

for (const localeOverrides of Object.values(canonicalUserNamingOverrides)) {
  localeOverrides.web["home.plan.starter.name"] = "Logivya Plus";
  localeOverrides.web["home.plan.professional.name"] = "Logivya Pro";
  localeOverrides.mobile.planStarterName = "Logivya Plus";
  localeOverrides.mobile.planProfessionalName = "Logivya Pro";
  const invitationMessage = localeOverrides.web["email.teamInvitation.linkMessage"];
  if (invitationMessage && !invitationMessage.includes("support@logivya.com")) {
    localeOverrides.web["email.teamInvitation.linkMessage"] = `${invitationMessage} Support: support@logivya.com`;
  }
}

const protectedTokenPattern = /\{[^{}]+\}|https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|#[0-9a-f]{3,8}\b|\b(?:Logivya|WhatsApp|Telegram|PayTR|Iyzico|Stripe|Android|iOS|API|QR|ISO-8601|URL|KVKK|SaaS|JWT|Redis|Prisma|Vercel|Cloudflare|Render|Expo|Google Play)\b/gi;
const turkishResidue = /\b(?:kullanıcı|şirket|ayarlar|kaydet|başarısız|başarılı|ödeme|abonelik|deneme|destek|hesaplar|gruplar|kategoriler|gönder|bağlantı|yeniden|silindi|iptal edildi|bulunamadı|yüklenemedi|geçersiz)\b/i;

function readJson(file) {
  return fs.readFile(file, "utf8").then(JSON.parse);
}

async function writeFileWithRetry(file, contents, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.writeFile(file, contents, "utf8");
      return;
    } catch (error) {
      if (attempt === attempts || !["EBUSY", "EPERM", "UNKNOWN"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}

function propertyName(node, sourceFile) {
  return node.name && (node.name.text ?? node.name.getText(sourceFile).replace(/^['"]|['"]$/g, ""));
}

async function readMobileBase() {
  const file = path.join(root, "apps", "mobile", "src", "i18n", "translations.ts");
  const source = await fs.readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let translationsInitializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "baseTranslations") translationsInitializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  while (translationsInitializer && ts.isAsExpression(translationsInitializer)) translationsInitializer = translationsInitializer.expression;
  if (!translationsInitializer || !ts.isObjectLiteralExpression(translationsInitializer)) throw new Error("Mobile translations object was not found");

  const result = {};
  for (const localeProperty of translationsInitializer.properties) {
    if (!ts.isPropertyAssignment(localeProperty) || !ts.isObjectLiteralExpression(localeProperty.initializer)) continue;
    const locale = propertyName(localeProperty, sourceFile);
    if (!locale || !["tr", "en"].includes(locale)) continue;
    result[locale] = {};
    for (const translationProperty of localeProperty.initializer.properties) {
      if (!ts.isPropertyAssignment(translationProperty) || !ts.isStringLiteralLike(translationProperty.initializer)) {
        throw new Error(`Unsupported mobile translation at ${translationProperty.getStart(sourceFile)}`);
      }
      result[locale][propertyName(translationProperty, sourceFile)] = translationProperty.initializer.text;
    }
  }
  if (!result.en || !result.tr) throw new Error("Mobile English and Turkish dictionaries are required");
  return result;
}

function protectTokens(value) {
  const tokens = [];
  const text = value.replace(protectedTokenPattern, (token) => {
    const index = tokens.push(token) - 1;
    return `__L10N_TOKEN_${index}__`;
  });
  return { text, tokens };
}

function restoreTokens(value, tokens) {
  return value.replace(/__L10N_TOKEN_(\d+)__/g, (_, index) => tokens[Number(index)] ?? "").trim();
}

async function createBingSession() {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
  const response = await fetch("https://www.bing.com/translator", { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Bing translator session returned ${response.status}`);
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const html = await response.text();
  const abuseMatch = html.match(/params_AbusePreventionHelper\s*=\s*(\[[^;]+\])/i);
  const ig = html.match(/IG:\"([^\"]+)/i)?.[1];
  const iid = html.match(/data-iid=\"([^\"]+)/i)?.[1];
  if (!abuseMatch || !ig || !iid) throw new Error("Bing translator session could not be parsed");
  const [key, token] = JSON.parse(abuseMatch[1]);
  return { userAgent, cookies, key: String(key), token, ig, iid };
}

async function bingTranslate(text, locale, attempt = 0) {
  try {
    bingSession ??= await createBingSession();
    const target = locale === "sr" ? "sr-Latn" : googleLocale[locale];
    const body = new URLSearchParams({
      fromLang: "en",
      text,
      to: target,
      token: bingSession.token,
      key: bingSession.key,
      tryFetchingGenderDebiasedTranslations: "true",
    });
    const response = await fetch(`https://www.bing.com/ttranslatev3?isVertical=1&IG=${bingSession.ig}&IID=${bingSession.iid}.${++bingRequestCounter}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": bingSession.userAgent,
        cookie: bingSession.cookies,
        referer: "https://www.bing.com/translator",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const error = new Error(`Bing translator returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const translated = payload?.[0]?.translations?.[0]?.text;
    if (typeof translated !== "string" || !translated) throw new Error("Bing translator response could not be parsed");
    return translated;
  } catch (error) {
    bingSession = null;
    if (error?.status === 400 || error?.status === 401 || error?.status === 403 || (error instanceof Error && error.message.includes("could not be parsed"))) throw error;
    if (attempt >= 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, error?.status === 429 ? 15_000 * (attempt + 1) : 1_000 * 2 ** attempt));
    return bingTranslate(text, locale, attempt + 1);
  }
}

async function googleTranslate(text, locale, attempt = 0) {
  if (requestDelay) await new Promise((resolve) => setTimeout(resolve, requestDelay));
  const target = locale === "sr" ? "sr" : googleLocale[locale];
  const body = new URLSearchParams({ client: "gtx", sl: "en", tl: target, dt: "t", q: text });
  const response = await fetch("https://translate.googleapis.com/translate_a/single", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 15_000 * 2 ** attempt));
      return googleTranslate(text, locale, attempt + 1);
    }
    throw new Error(`Google translator returned ${response.status}`);
  }
  const payload = await response.json();
  const chunks = Array.isArray(payload?.[0]) ? payload[0] : [];
  const translated = chunks.map((chunk) => Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : "").join("");
  if (!translated) throw new Error("Google translator response could not be parsed");
  return translated;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

async function googleMobileTranslate(text, locale) {
  const target = locale === "sr" ? "sr" : googleLocale[locale];
  const url = new URL("https://translate.google.com/m");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", target);
  url.searchParams.set("q", text);
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; LogivyaLocalizationQA/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google mobile translator returned ${response.status}`);
  const html = await response.text();
  const translated = html.match(/<div class="result-container">([\s\S]*?)<\/div>/i)?.[1];
  if (!translated) throw new Error("Google mobile translator response could not be parsed");
  return decodeHtmlEntities(translated.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

async function translateText(text, locale) {
  // Explicit API mode uses a single provider and respects its existing retry/backoff.
  if (process.env.L10N_PROVIDER === "google-api" && process.env.L10N_OFFLINE_ONLY !== "1") return googleTranslate(text, locale);
  if (process.env.L10N_OFFLINE_ONLY === "1") throw new Error(`No reviewed cached translation is available for ${locale}`);
  try {
    return await googleMobileTranslate(text, locale);
  } catch (mobileError) {
    try {
      return await myMemoryTranslate(text, locale);
    } catch (memoryError) {
      try {
        return await bingTranslate(text, locale);
      } catch (bingError) {
        try {
          return await googleTranslate(text, locale);
        } catch (googleError) {
          throw new Error(`Translation RPCs failed: Google mobile: ${mobileError instanceof Error ? mobileError.message : String(mobileError)}; MyMemory: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}; Bing: ${bingError instanceof Error ? bingError.message : String(bingError)}; Google API: ${googleError instanceof Error ? googleError.message : String(googleError)}`);
        }
      }
    }
  }
}

async function myMemoryTranslate(text, locale) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `en|${locale === "sr" ? "sr" : googleLocale[locale]}`);
  if (process.env.TRANSLATION_CONTACT_EMAIL) url.searchParams.set("de", process.env.TRANSLATION_CONTACT_EMAIL);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.responseStatus !== 200 || payload?.quotaFinished) {
    throw new Error(`MyMemory translator returned ${payload?.responseStatus ?? response.status}`);
  }
  const translated = payload?.responseData?.translatedText;
  if (typeof translated !== "string" || !translated) throw new Error("MyMemory translator response could not be parsed");
  return translated
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function parseBatch(translated, count) {
  const found = new Map();
  const marker = /__L10N_START_(\d+)__([\s\S]*?)__L10N_END_\1__/g;
  for (const match of translated.matchAll(marker)) found.set(Number(match[1]), match[2].trim());
  return found.size === count ? [...Array(count)].map((_, index) => found.get(index) ?? "") : null;
}

async function translateBatch(values, locale) {
  const protectedValues = values.map(protectTokens);
  const source = protectedValues.map((item, index) => `__L10N_START_${index}__${item.text}__L10N_END_${index}__`).join("\n");
  let translated;
  try {
    translated = await translateText(source, locale);
  } catch (error) {
    if (values.length > 1 && error instanceof Error && error.message.startsWith("Translation RPC")) {
      const midpoint = Math.ceil(values.length / 2);
      const left = await translateBatch(values.slice(0, midpoint), locale);
      const right = await translateBatch(values.slice(midpoint), locale);
      return [...left, ...right];
    }
    throw error;
  }
  const parsed = parseBatch(translated, values.length);
  if (parsed) return parsed.map((value, index) => restoreTokens(value, protectedValues[index].tokens));
  if (values.length > 1) {
    const midpoint = Math.ceil(values.length / 2);
    const left = await translateBatch(values.slice(0, midpoint), locale);
    const right = await translateBatch(values.slice(midpoint), locale);
    return [...left, ...right];
  }
  return [restoreTokens(await translateText(protectedValues[0].text, locale), protectedValues[0].tokens)];
}

async function mapWithConcurrency(items, workers, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index], index);
    }
  }));
  return result;
}

const serbianCyrillicToLatin = {
  Љ: "Lj", Њ: "Nj", Џ: "Dž", љ: "lj", њ: "nj", џ: "dž", Ђ: "Đ", Ј: "J", Ћ: "Ć", Ч: "Č", Ш: "Š", Ж: "Ž",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", З: "Z", И: "I", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "C",
  ђ: "đ", ј: "j", ћ: "ć", ч: "č", ш: "š", ж: "ž", а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", з: "z", и: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
};

function toSerbianLatin(value) {
  return value.replace(/[\u0400-\u04ff]/g, (character) => serbianCyrillicToLatin[character] ?? character);
}

function placeholders(value) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

function hasQuestionMarkCorruption(source, value) {
  const sourceCount = (String(source).match(/\?/g) ?? []).length;
  const valueCount = (String(value).match(/\?/g) ?? []).length;
  return valueCount > sourceCount;
}

const nativeIdenticalValues = {
  ar: new Set(),
  ro: new Set(["Administrator", "Operator", "Popular", "Urgent", "Plan", "Manual", "Individual", "Marketing", "Total", "Export", "Feedback", "Manager", "Interval: 1", "Normal"]),
  ru: new Set(),
  az: new Set(["Status", "Operator", "Plan", "Normal"]),
  tk: new Set(["Status", "Operator"]),
  de: new Set(["Support", "Status", "Administrator", "Operator", "System", "Start", "Ticket", "Name", "Marketing", "Information", "Version", "Export", "Compliance", "Feedback", "Manager", "Tickets", "Orange", "Normal", "Team"]),
  bg: new Set(),
  el: new Set(),
  sr: new Set(["Status", "Administrator", "Plan", "Marketing", "Interval: 1"]),
};

function isAllowedIdentical(value, locale) {
  const stripped = value
    .replace(protectedTokenPattern, "")
    .replace(/[\d\s\p{P}\p{S}]/gu, "");
  const normalized = value.trim();
  return !stripped
    || /^(?:Ctrl K|5x{2} x{3} x{2} x{2}|\d+\s*(?:TL|TRY|₺)|Starter|Webhook|Webhooks|Professional|Enterprise|Logivya Mobile)$/i.test(normalized)
    || nativeIdenticalValues[locale]?.has(normalized);
}

function validateCatalog(locale, english, dictionary, name) {
  const issues = [];
  const englishKeys = Object.keys(english);
  if (Object.keys(dictionary).length !== englishKeys.length) issues.push(`${name}: key count differs`);
  for (const key of englishKeys) {
    const value = dictionary[key];
    if (typeof value !== "string" || !value.trim()) issues.push(`${name}: empty ${key}`);
    if (JSON.stringify(placeholders(english[key])) !== JSON.stringify(placeholders(value ?? ""))) issues.push(`${name}: placeholders differ for ${key}`);
    if (hasQuestionMarkCorruption(english[key], value ?? "")) issues.push(`${name}: question-mark encoding corruption in ${key}`);
    if (/(?:Ã¼|Ã§|Ã¶|Ã¢|Ä±|ÄŸ|Äƒ|ÅŸ|Åž|â€™|â€“|Â|\uFFFD)/.test(value ?? "")) issues.push(`${name}: invalid encoding in ${key}`);
    if (locale === "sr" && /[\u0400-\u04ff]/.test(value ?? "")) issues.push(`${name}: Serbian Cyrillic remains in ${key}`);
  }
  return issues;
}

async function buildLocale(locale, rootEnglish, rootTurkish, mobileBase) {
  const localePath = path.join(root, "packages", "locales", `${locale}.json`);
  const mobileLocalePath = path.join(root, "apps", "mobile", "src", "i18n", "locales", `${locale}.json`);
  const existing = await readJson(localePath).catch(() => ({}));
  const existingMobile = await readJson(mobileLocalePath).catch(() => ({}));
  const sourceValues = [...new Set([...Object.values(rootEnglish), ...Object.values(mobileBase.en)])];
  const phraseOverrides = curatedTerms[locale];
  const valuesToTranslate = sourceValues.filter((value) => !phraseOverrides[value]);
  const translationMemory = new Map();
  const seedTranslation = (source, value) => {
    if (typeof value !== "string" || !value.trim()) return;
    if (JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(value))) return;
    if (hasQuestionMarkCorruption(source, value)) return;
    if (value === source && !isAllowedIdentical(source, locale)) return;
    if (["ro", "ru", "de", "bg", "el", "sr"].includes(locale) && turkishResidue.test(value)) return;
    if (locale === "sr" && /[\u0400-\u04ff]/.test(value)) return;
    translationMemory.set(source, value);
  };
  Object.entries(rootEnglish).forEach(([key, source]) => seedTranslation(source, existing[key]));
  Object.entries(mobileBase.en).forEach(([key, source]) => seedTranslation(source, existingMobile[key]));
  Object.entries(curatedMobileOverrides[locale]).forEach(([key, translated]) => {
    const source = mobileBase.en[key];
    if (source) seedTranslation(source, translated);
  });
  for (const source of valuesToTranslate) {
    const cached = translationCache[`${locale}\u0000${source}`];
    if (typeof cached === "string" && cached.trim()) translationMemory.set(source, cached);
  }
  const pendingValues = valuesToTranslate.filter((value) => !translationMemory.has(value));
  if (process.env.L10N_OFFLINE_ONLY === "1" && pendingValues.length) {
    throw new Error(`Missing offline translations for ${locale}: ${JSON.stringify(pendingValues.slice(0, 10))}`);
  }
  const batches = [];
  for (let index = 0; index < pendingValues.length; index += batchSize) batches.push(pendingValues.slice(index, index + batchSize));

  process.stdout.write(`[i18n] ${locale}: ${translationMemory.size} cached, translating ${pendingValues.length} phrases in ${batches.length} batches\n`);
  await mapWithConcurrency(batches, concurrency, async (batch) => {
    const values = await translateBatch(batch, locale);
    batch.forEach((source, index) => {
      const value = locale === "sr" ? toSerbianLatin(values[index]) : values[index];
      translationMemory.set(source, value);
      translationCache[`${locale}\u0000${source}`] = value;
    });
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await writeFileWithRetry(cachePath, `${JSON.stringify(translationCache)}\n`);
  });
  const invalidTranslations = valuesToTranslate.filter((source) => {
    const value = translationMemory.get(source) ?? "";
    const alreadyReviewed = translationCache[`__reviewed__\u0000${locale}\u0000${source}`] === true;
    return !value.trim()
      || JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(value))
      || hasQuestionMarkCorruption(source, value)
      || (value === source && !isAllowedIdentical(source, locale) && !alreadyReviewed);
  });
  if (invalidTranslations.length) {
    process.stdout.write(`[i18n] ${locale}: repairing ${invalidTranslations.length} phrases individually (${invalidTranslations.slice(0, 8).join(" | ")})\n`);
    const repaired = await mapWithConcurrency(invalidTranslations, concurrency, async (source) => (await translateBatch([source], locale))[0]);
    invalidTranslations.forEach((source, index) => {
      const value = locale === "sr" ? toSerbianLatin(repaired[index]) : repaired[index];
      translationMemory.set(source, value);
      translationCache[`${locale}\u0000${source}`] = value;
      translationCache[`__reviewed__\u0000${locale}\u0000${source}`] = true;
    });
    await writeFileWithRetry(cachePath, `${JSON.stringify(translationCache)}\n`);
  }
  Object.entries(phraseOverrides).forEach(([source, target]) => translationMemory.set(source, target));

  const rootDictionary = {};
  for (const [key, source] of Object.entries(rootEnglish)) {
    const existingValue = existing[key];
    const forceRegenerate = key === "home.trialBadge" || key.startsWith("home.plan.") || key.startsWith("legal.");
    const validExisting = typeof existingValue === "string"
      && existingValue.trim()
      && !forceRegenerate
      && JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(existingValue))
      && !hasQuestionMarkCorruption(source, existingValue)
      && (existingValue !== source || isAllowedIdentical(source, locale))
      && (!["ro", "ru", "de", "bg", "el", "sr"].includes(locale) || !turkishResidue.test(existingValue))
      && (locale !== "sr" || !/[\u0400-\u04ff]/.test(existingValue));
    rootDictionary[key] = validExisting
      ? existingValue
      : translationMemory.get(source) ?? source;
    if (locale === "sr") rootDictionary[key] = toSerbianLatin(rootDictionary[key]);
  }
  Object.assign(rootDictionary, curatedKeyOverrides[locale]);
  for (const [key, source] of Object.entries(rootEnglish)) {
    if (key.startsWith("home.plan.")) rootDictionary[key] = translationMemory.get(source) ?? source;
  }
  Object.assign(rootDictionary, canonicalUserNamingOverrides[locale].web);
  if (locale === "ro") {
    Object.keys(rootDictionary).forEach((key) => {
      rootDictionary[key] = normalizeRomanianTypography(rootDictionary[key]);
    });
  }

  const exactRootMemory = new Map(Object.keys(rootEnglish).map((key) => [rootEnglish[key], rootDictionary[key]]));
  const mobileDictionary = {};
  for (const [key, source] of Object.entries(mobileBase.en)) {
    mobileDictionary[key] = exactRootMemory.get(source) ?? translationMemory.get(source) ?? source;
    if (locale === "sr") mobileDictionary[key] = toSerbianLatin(mobileDictionary[key]);
  }
  Object.assign(mobileDictionary, curatedMobileOverrides[locale]);
  Object.assign(mobileDictionary, canonicalUserNamingOverrides[locale].mobile);
  if (locale === "ro") {
    Object.keys(mobileDictionary).forEach((key) => {
      mobileDictionary[key] = normalizeRomanianTypography(mobileDictionary[key]);
    });
  }

  const issues = [
    ...validateCatalog(locale, rootEnglish, rootDictionary, `${locale}/web`),
    ...validateCatalog(locale, mobileBase.en, mobileDictionary, `${locale}/mobile`),
  ];
  const untranslated = [
    ...Object.keys(rootEnglish).filter((key) => rootDictionary[key] === rootEnglish[key] && !isAllowedIdentical(rootEnglish[key], locale)).map((key) => `web:${key}`),
    ...Object.keys(mobileBase.en).filter((key) => mobileDictionary[key] === mobileBase.en[key] && !isAllowedIdentical(mobileBase.en[key], locale)).map((key) => `mobile:${key}`),
  ];
  if (issues.length) throw new Error(issues.slice(0, 20).join("\n"));
  if (untranslated.length) process.stdout.write(`[i18n] ${locale}: ${untranslated.length} identical phrases require review (${untranslated.slice(0, 8).join(", ")})\n`);

  await fs.mkdir(path.join(root, "apps", "mobile", "src", "i18n", "locales"), { recursive: true });
  await writeFileWithRetry(localePath, `${JSON.stringify(rootDictionary, null, 2)}\n`);
  await writeFileWithRetry(mobileLocalePath, `${JSON.stringify(mobileDictionary, null, 2)}\n`);
  return { locale, web: Object.keys(rootDictionary).length, mobile: Object.keys(mobileDictionary).length, untranslated: untranslated.length };
}

const uzbekOverrides = JSON.parse(await fs.readFile(path.join(root, "shared", "uzbek-locale-overrides.json"), "utf8"));
curatedTerms.uz = uzbekOverrides.terms;
curatedMobileOverrides.uz = uzbekOverrides.mobile;
curatedKeyOverrides.uz = uzbekOverrides.web;
canonicalUserNamingOverrides.uz = uzbekOverrides.naming;
nativeIdenticalValues.uz = new Set(["Beta", "OK", "Video", "Logivya Plus", "Logivya Pro", "Operator", "Normal", "Marketing", "Format", "Internet", "Administrator", "Plus", "Pro"]);

if (!process.argv.includes("--write")) {
  console.error("Pass --write to generate locale catalogs.");
  process.exit(1);
}

const [rootEnglish, rootTurkish, mobileBase] = await Promise.all([
  readJson(path.join(root, "packages", "locales", "en.json")),
  readJson(path.join(root, "packages", "locales", "tr.json")),
  readMobileBase(),
]);
translationCache = await readJson(cachePath).catch(() => ({}));
const haveSameKeys = (left, right) =>
  JSON.stringify(Object.keys(left).sort()) === JSON.stringify(Object.keys(right).sort());

if (!haveSameKeys(rootEnglish, rootTurkish)) throw new Error("English and Turkish web keys differ");
if (!haveSameKeys(mobileBase.en, mobileBase.tr)) throw new Error("English and Turkish mobile keys differ");

const summary = [];
for (const locale of targetLocales) summary.push(await buildLocale(locale, rootEnglish, rootTurkish, mobileBase));
console.log(JSON.stringify(summary, null, 2));
