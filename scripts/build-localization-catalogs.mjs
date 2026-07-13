import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const targetLocales = ["ro", "ru", "az", "tk", "de", "bg", "el", "sr"];
const googleLocale = { ro: "ro", ru: "ru", az: "az", tk: "tk", de: "de", bg: "bg", el: "el", sr: "sr" };
const batchSize = 30;
const concurrency = 1;
const cachePath = path.join(root, ".cache", "localization-catalogs.json");
let translationCache = {};
let bingSession = null;
let bingRequestCounter = 0;

const curatedTerms = {
  ro: {
    Dashboard: "Panou de control", Accounts: "Conturi", Groups: "Grupuri", Categories: "Categorii",
    "Send Message": "Trimite mesaj", "Message History": "Istoric mesaje", Support: "Asistență", Settings: "Setări",
    Subscriptions: "Abonamente", Contacts: "Contacte", Users: "Utilizatori", Companies: "Companii",
    Connected: "Conectat", "Not connected": "Neconectat", Connecting: "Se conectează", Reconnecting: "Se reconectează",
    Active: "Activ", Pending: "În așteptare", Failed: "Eșuat", Completed: "Finalizat", Cancelled: "Anulat",
    Trial: "Perioadă de probă", Professional: "Profesional", Admin: "Administrator", Save: "Salvează",
    Delete: "Șterge", Edit: "Editează", Cancel: "Anulează", Search: "Caută", "Try again": "Încearcă din nou",
  },
  ru: {
    Dashboard: "Панель управления", Accounts: "Аккаунты", Groups: "Группы", Categories: "Категории",
    "Send Message": "Отправить сообщение", "Message History": "История сообщений", Support: "Поддержка", Settings: "Настройки",
    Subscriptions: "Подписки", Contacts: "Контакты", Users: "Пользователи", Companies: "Компании",
    Connected: "Подключено", "Not connected": "Не подключено", Connecting: "Подключение", Reconnecting: "Повторное подключение",
    Active: "Активно", Pending: "Ожидает", Failed: "Ошибка", Completed: "Завершено", Cancelled: "Отменено",
    Trial: "Пробный период", Professional: "Профессиональный", Admin: "Администратор", Save: "Сохранить",
    Delete: "Удалить", Edit: "Изменить", Cancel: "Отмена", Search: "Поиск", "Try again": "Повторить",
  },
  az: {
    Dashboard: "İdarəetmə paneli", Accounts: "Hesablar", Groups: "Qruplar", Categories: "Kateqoriyalar",
    "Send Message": "Mesaj göndər", "Message History": "Mesaj tarixçəsi", Support: "Dəstək", Settings: "Parametrlər",
    Subscriptions: "Abunəliklər", Contacts: "Kontaktlar", Users: "İstifadəçilər", Companies: "Şirkətlər",
    Connected: "Qoşulub", "Not connected": "Qoşulmayıb", Connecting: "Qoşulur", Reconnecting: "Yenidən qoşulur",
    Active: "Aktiv", Pending: "Gözləyir", Failed: "Uğursuz", Completed: "Tamamlandı", Cancelled: "Ləğv edildi",
    Trial: "Sınaq", Professional: "Peşəkar", Admin: "İnzibatçı", Save: "Yadda saxla",
    Delete: "Sil", Edit: "Redaktə et", Cancel: "Ləğv et", Search: "Axtar", "Try again": "Yenidən cəhd et",
  },
  tk: {
    Dashboard: "Dolandyryş paneli", Accounts: "Hasaplar", Groups: "Toparlar", Categories: "Kategoriýalar",
    "Send Message": "Habar iber", "Message History": "Habar taryhy", Support: "Goldaw", Settings: "Sazlamalar",
    Subscriptions: "Abunalyklar", Contacts: "Aragatnaşyklar", Users: "Ulanyjylar", Companies: "Kompaniýalar",
    Connected: "Birikdirildi", "Not connected": "Birikdirilmedi", Connecting: "Birikdirilýär", Reconnecting: "Gaýtadan birikdirilýär",
    Active: "Işjeň", Pending: "Garaşylýar", Failed: "Şowsuz", Completed: "Tamamlandy", Cancelled: "Ýatyryldy",
    Trial: "Synag", Professional: "Professional", Admin: "Dolandyryjy", Save: "Ýatda sakla",
    Delete: "Poz", Edit: "Üýtget", Cancel: "Ýatyr", Search: "Gözle", "Try again": "Gaýtadan synanyş",
  },
  de: {
    Dashboard: "Übersicht", Accounts: "Konten", Groups: "Gruppen", Categories: "Kategorien",
    "Send Message": "Nachricht senden", "Message History": "Nachrichtenverlauf", Support: "Support", Settings: "Einstellungen",
    Subscriptions: "Abonnements", Contacts: "Kontakte", Users: "Benutzer", Companies: "Unternehmen",
    Connected: "Verbunden", "Not connected": "Nicht verbunden", Connecting: "Verbindung wird hergestellt", Reconnecting: "Verbindung wird wiederhergestellt",
    Active: "Aktiv", Pending: "Ausstehend", Failed: "Fehlgeschlagen", Completed: "Abgeschlossen", Cancelled: "Storniert",
    Trial: "Testphase", Professional: "Professional", Admin: "Administrator", Save: "Speichern",
    Delete: "Löschen", Edit: "Bearbeiten", Cancel: "Abbrechen", Search: "Suchen", "Try again": "Erneut versuchen",
  },
  bg: {
    Dashboard: "Табло за управление", Accounts: "Акаунти", Groups: "Групи", Categories: "Категории",
    "Send Message": "Изпращане на съобщение", "Message History": "История на съобщенията", Support: "Поддръжка", Settings: "Настройки",
    Subscriptions: "Абонаменти", Contacts: "Контакти", Users: "Потребители", Companies: "Компании",
    Connected: "Свързан", "Not connected": "Няма връзка", Connecting: "Свързване", Reconnecting: "Повторно свързване",
    Active: "Активен", Pending: "Изчаква", Failed: "Неуспешно", Completed: "Завършено", Cancelled: "Отменено",
    Trial: "Пробен период", Professional: "Професионален", Admin: "Администратор", Save: "Запазване",
    Delete: "Изтриване", Edit: "Редактиране", Cancel: "Отказ", Search: "Търсене", "Try again": "Опитайте отново",
  },
  el: {
    Dashboard: "Πίνακας ελέγχου", Accounts: "Λογαριασμοί", Groups: "Ομάδες", Categories: "Κατηγορίες",
    "Send Message": "Αποστολή μηνύματος", "Message History": "Ιστορικό μηνυμάτων", Support: "Υποστήριξη", Settings: "Ρυθμίσεις",
    Subscriptions: "Συνδρομές", Contacts: "Επαφές", Users: "Χρήστες", Companies: "Εταιρείες",
    Connected: "Συνδεδεμένο", "Not connected": "Μη συνδεδεμένο", Connecting: "Γίνεται σύνδεση", Reconnecting: "Γίνεται επανασύνδεση",
    Active: "Ενεργό", Pending: "Σε αναμονή", Failed: "Απέτυχε", Completed: "Ολοκληρώθηκε", Cancelled: "Ακυρώθηκε",
    Trial: "Δοκιμαστική περίοδος", Professional: "Επαγγελματικό", Admin: "Διαχειριστής", Save: "Αποθήκευση",
    Delete: "Διαγραφή", Edit: "Επεξεργασία", Cancel: "Ακύρωση", Search: "Αναζήτηση", "Try again": "Δοκιμάστε ξανά",
  },
  sr: {
    Dashboard: "Kontrolna tabla", Accounts: "Nalozi", Groups: "Grupe", Categories: "Kategorije",
    "Send Message": "Pošalji poruku", "Message History": "Istorija poruka", Support: "Podrška", Settings: "Podešavanja",
    Subscriptions: "Pretplate", Contacts: "Kontakti", Users: "Korisnici", Companies: "Kompanije",
    Connected: "Povezano", "Not connected": "Nije povezano", Connecting: "Povezivanje", Reconnecting: "Ponovno povezivanje",
    Active: "Aktivno", Pending: "Na čekanju", Failed: "Neuspešno", Completed: "Završeno", Cancelled: "Otkazano",
    Trial: "Probni period", Professional: "Profesionalni", Admin: "Administrator", Save: "Sačuvaj",
    Delete: "Obriši", Edit: "Izmeni", Cancel: "Otkaži", Search: "Pretraži", "Try again": "Pokušaj ponovo",
  },
};

const curatedMobileOverrides = {
  ro: {
    roleSuperAdmin: "Superadministrator",
    feedbackTitle: "Feedback Logivya",
    district: "Județ",
  },
  ru: {},
  az: {
    roleSuperAdmin: "Super inzibatçı",
  },
  tk: {
    sent: "Iberildi",
    emailSent: "Iberildi",
    roleAdmin: "Dolandyryjy",
    roleSuperAdmin: "Baş dolandyryjy",
  },
  de: {
    screenshotUrl: "Screenshot-URL",
    liveApi: "Live-API",
  },
  bg: {},
  el: {
    emailDelivery: "Παράδοση email: {status}",
  },
  sr: {
    email: "E-pošta",
    emailDelivery: "Isporuka e-pošte: {status}",
    feedbackTitle: "Povratne informacije za Logivya",
    roleOperator: "Operater",
  },
};

function normalizeRomanianTypography(value) {
  return value.replaceAll("Ş", "Ș").replaceAll("ş", "ș").replaceAll("Ţ", "Ț").replaceAll("ţ", "ț");
}

const curatedKeyOverrides = {
  ro: {
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

const protectedTokenPattern = /\{[^{}]+\}|https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|#[0-9a-f]{3,8}\b|\b(?:Logivya|WhatsApp|PayTR|Iyzico|Stripe|Android|iOS|API|QR|ISO-8601|URL|KVKK|SaaS|JWT|Redis|Prisma|Vercel|Cloudflare|Render|Expo|Google Play)\b/gi;
const turkishResidue = /\b(?:kullanıcı|şirket|ayarlar|kaydet|başarısız|başarılı|ödeme|abonelik|deneme|destek|hesaplar|gruplar|kategoriler|gönder|bağlantı|yeniden|silindi|iptal edildi|bulunamadı|yüklenemedi|geçersiz)\b/i;

function readJson(file) {
  return fs.readFile(file, "utf8").then(JSON.parse);
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
    return `\uE100${index}\uE101`;
  });
  return { text, tokens };
}

function restoreTokens(value, tokens) {
  return value.replace(/\uE100\s*(\d+)\s*\uE101/g, (_, index) => tokens[Number(index)] ?? "").trim();
}

async function createBingSession() {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
  const response = await fetch("https://www.bing.com/translator", { headers: { "user-agent": userAgent } });
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
    if (error?.status === 400 || (error instanceof Error && error.message.includes("could not be parsed"))) throw error;
    if (attempt >= 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, error?.status === 429 ? 15_000 * (attempt + 1) : 1_000 * 2 ** attempt));
    return bingTranslate(text, locale, attempt + 1);
  }
}

async function translateText(text, locale) {
  try {
    return await bingTranslate(text, locale);
  } catch (error) {
    throw new Error(`Translation RPC Bing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseBatch(translated, count) {
  const found = new Map();
  const marker = /\uE000\s*(\d+)\s*\uE001([\s\S]*?)\uE002\s*\1\s*\uE003/g;
  for (const match of translated.matchAll(marker)) found.set(Number(match[1]), match[2].trim());
  return found.size === count ? [...Array(count)].map((_, index) => found.get(index) ?? "") : null;
}

async function translateBatch(values, locale) {
  const protectedValues = values.map(protectTokens);
  const source = protectedValues.map((item, index) => `\uE000${index}\uE001${item.text}\uE002${index}\uE003`).join("\n");
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
  ro: new Set(["Administrator", "Operator", "Popular", "Urgent", "Plan", "Manual", "Individual", "Marketing", "Total", "Export", "Feedback", "Manager", "Interval: 1"]),
  ru: new Set(),
  az: new Set(["Status", "Operator", "Plan"]),
  tk: new Set(["Status", "Operator"]),
  de: new Set(["Support", "Status", "Administrator", "Operator", "System", "Start", "Ticket", "Name", "Marketing", "Information", "Version", "Export", "Compliance", "Feedback", "Manager", "Tickets", "Orange"]),
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
  const localePath = path.join(root, "locales", `${locale}.json`);
  const existing = await readJson(localePath).catch(() => ({}));
  const sourceValues = [...new Set([...Object.values(rootEnglish), ...Object.values(mobileBase.en)])];
  const phraseOverrides = curatedTerms[locale];
  const valuesToTranslate = sourceValues.filter((value) => !phraseOverrides[value]);
  const translationMemory = new Map();
  for (const source of valuesToTranslate) {
    const cached = translationCache[`${locale}\u0000${source}`];
    if (typeof cached === "string" && cached.trim()) translationMemory.set(source, cached);
  }
  const pendingValues = valuesToTranslate.filter((value) => !translationMemory.has(value));
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
    await fs.writeFile(cachePath, `${JSON.stringify(translationCache)}\n`, "utf8");
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
    process.stdout.write(`[i18n] ${locale}: repairing ${invalidTranslations.length} phrases individually\n`);
    const repaired = await mapWithConcurrency(invalidTranslations, concurrency, async (source) => (await translateBatch([source], locale))[0]);
    invalidTranslations.forEach((source, index) => {
      const value = locale === "sr" ? toSerbianLatin(repaired[index]) : repaired[index];
      translationMemory.set(source, value);
      translationCache[`${locale}\u0000${source}`] = value;
      translationCache[`__reviewed__\u0000${locale}\u0000${source}`] = true;
    });
    await fs.writeFile(cachePath, `${JSON.stringify(translationCache)}\n`, "utf8");
  }
  Object.entries(phraseOverrides).forEach(([source, target]) => translationMemory.set(source, target));

  const rootDictionary = {};
  for (const [key, source] of Object.entries(rootEnglish)) {
    const existingValue = existing[key];
    const forceRegenerate = key === "home.trialBadge" || key.startsWith("home.plan.");
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
  await fs.writeFile(localePath, `${JSON.stringify(rootDictionary, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(root, "apps", "mobile", "src", "i18n", "locales", `${locale}.json`), `${JSON.stringify(mobileDictionary, null, 2)}\n`, "utf8");
  return { locale, web: Object.keys(rootDictionary).length, mobile: Object.keys(mobileDictionary).length, untranslated: untranslated.length };
}

if (!process.argv.includes("--write")) {
  console.error("Pass --write to generate locale catalogs.");
  process.exit(1);
}

const [rootEnglish, rootTurkish, mobileBase] = await Promise.all([
  readJson(path.join(root, "locales", "en.json")),
  readJson(path.join(root, "locales", "tr.json")),
  readMobileBase(),
]);
translationCache = await readJson(cachePath).catch(() => ({}));
if (JSON.stringify(Object.keys(rootEnglish)) !== JSON.stringify(Object.keys(rootTurkish))) throw new Error("English and Turkish web keys differ");
if (JSON.stringify(Object.keys(mobileBase.en)) !== JSON.stringify(Object.keys(mobileBase.tr))) throw new Error("English and Turkish mobile keys differ");

const summary = [];
for (const locale of targetLocales) summary.push(await buildLocale(locale, rootEnglish, rootTurkish, mobileBase));
console.log(JSON.stringify(summary, null, 2));
