const keys = ["publication", "publicationHelp", "review", "queued", "running", "completed", "partial", "failed", "cancelled", "expired", "cancelDeadline", "deletionHelp", "reference", "period", "receipt", "notSpecified", "navigationSearch"] as const;
const rows: Record<string, string> = {
 tr: "Canlı ilan kaynağı|Bu sohbetteki uygun yük ve araç ilanlarını Logivya pazarında herkese açık yayımla.|İnceleme bekliyor|Sırada|İşleniyor|Tamamlandı|Kısmen tamamlandı|Başarısız|İptal edildi|Süresi doldu|İptal için son tarih|Talebiniz alındı. Kalıcı silme işlemi inceleme sonrasında yürütülür. Durum ve destek için talep numaranızı kullanın.|İşlem referansı|Dönem|Makbuz / fatura|Belirtilmedi|Sayfalarda ara",
 en: "Live listing source|Publish eligible load and vehicle listings from this chat publicly on Logivya.|Awaiting review|Queued|Processing|Completed|Partially completed|Failed|Cancelled|Expired|Cancellation deadline|Your request has been received. Permanent deletion follows review. Use your request number to check progress or contact support.|Transaction reference|Period|Receipt / invoice|Not specified|Search pages",
 ar: "مصدر الإعلانات المباشرة|انشر إعلانات الشحنات والمركبات المؤهلة من هذه المحادثة للعامة على Logivya.|بانتظار المراجعة|في الانتظار|قيد المعالجة|مكتمل|مكتمل جزئيًا|فشل|ملغى|منتهي|آخر موعد للإلغاء|تم استلام طلبك. يتم الحذف الدائم بعد المراجعة. استخدم رقم الطلب للاستفسار عن التقدم أو التواصل مع الدعم.|مرجع المعاملة|الفترة|الإيصال / الفاتورة|غير محدد|البحث في الصفحات",
 uz: "Jonli e’lon manbasi|Bu chatdagi mos yuk va transport e’lonlarini Logivya bozorida hammaga ochiq nashr etish.|Tekshiruv kutilmoqda|Navbatda|Ishlanmoqda|Bajarildi|Qisman bajarildi|Muvaffaqiyatsiz|Bekor qilindi|Muddati tugadi|Bekor qilish muddati|So‘rovingiz qabul qilindi. Doimiy o‘chirish tekshiruvdan keyin bajariladi. Holat yoki yordam uchun so‘rov raqamingizdan foydalaning.|Tranzaksiya raqami|Davr|Kvitansiya / hisob-faktura|Ko‘rsatilmagan|Sahifalarni qidirish",
 de: "Quelle für Live-Inserate|Geeignete Fracht- und Fahrzeuginserate aus diesem Chat öffentlich auf Logivya veröffentlichen.|Prüfung ausstehend|In Warteschlange|Wird bearbeitet|Abgeschlossen|Teilweise abgeschlossen|Fehlgeschlagen|Storniert|Abgelaufen|Stornierungsfrist|Ihre Anfrage ist eingegangen. Die endgültige Löschung erfolgt nach Prüfung. Nutzen Sie Ihre Anfragenummer für Statusauskünfte oder Support.|Transaktionsreferenz|Zeitraum|Beleg / Rechnung|Nicht angegeben|Seiten durchsuchen",
 ru: "Источник объявлений|Публиковать подходящие объявления о грузах и транспорте из этого чата для всех на Logivya.|Ожидает проверки|В очереди|Обрабатывается|Завершено|Завершено частично|Ошибка|Отменено|Срок истёк|Срок отмены|Ваш запрос получен. Окончательное удаление выполняется после проверки. Используйте номер запроса для проверки статуса или обращения в поддержку.|Номер операции|Период|Квитанция / счёт|Не указано|Поиск страниц",
 ro: "Sursă de anunțuri live|Publică pe Logivya anunțurile eligibile de marfă și vehicule din această conversație.|În curs de verificare|În așteptare|Se procesează|Finalizat|Finalizat parțial|Eșuat|Anulat|Expirat|Termen de anulare|Cererea a fost primită. Ștergerea definitivă urmează verificării. Folosiți numărul cererii pentru stadiu sau asistență.|Referința tranzacției|Perioadă|Chitanță / factură|Nespecificat|Caută pagini",
 az: "Canlı elan mənbəyi|Bu söhbətdəki uyğun yük və nəqliyyat elanlarını Logivya bazarında hamıya açıq yayımla.|Yoxlama gözlənilir|Növbədə|İşlənir|Tamamlandı|Qismən tamamlandı|Uğursuz|Ləğv edildi|Müddəti bitdi|Ləğv üçün son tarix|Sorğunuz alındı. Daimi silinmə yoxlamadan sonra aparılır. Vəziyyət və dəstək üçün sorğu nömrənizdən istifadə edin.|Əməliyyat istinadı|Dövr|Qəbz / hesab-faktura|Göstərilməyib|Səhifələrdə axtar",
 tk: "Göni bildiriş çeşmesi|Bu söhbetdäki degişli ýük we ulag bildirişlerini Logivya bazarynda hemmeler üçin çap et.|Barlag garaşylýar|Nobatda|Işlenýär|Tamamlandy|Bölekleýin tamamlandy|Şowsuz|Ýatyryldy|Möhleti gutardy|Ýatyrmak üçin soňky sene|Talabyňyz kabul edildi. Hemişelik pozmak barlagdan soň ýerine ýetirilýär. Ýagdaý ýa-da goldaw üçin talap belgiňizi ulanyň.|Amalyň belgisi|Döwür|Kwitansiýa / hasap-faktura|Görkezilmedi|Sahypalary gözle",
 bg: "Източник на обяви|Публикувай подходящите обяви за товари и превозни средства от този чат публично в Logivya.|Очаква проверка|На опашка|Обработва се|Завършено|Частично завършено|Неуспешно|Отменено|Изтекло|Краен срок за отказ|Заявката е получена. Окончателното изтриване се извършва след проверка. Използвайте номера на заявката за статус или поддръжка.|Референция на операцията|Период|Разписка / фактура|Не е посочено|Търсене на страници",
 el: "Πηγή ζωντανών αγγελιών|Δημοσίευση κατάλληλων αγγελιών φορτίων και οχημάτων από αυτή τη συνομιλία δημόσια στο Logivya.|Αναμονή ελέγχου|Στην ουρά|Σε επεξεργασία|Ολοκληρώθηκε|Ολοκληρώθηκε εν μέρει|Απέτυχε|Ακυρώθηκε|Έληξε|Προθεσμία ακύρωσης|Το αίτημά σας ελήφθη. Η οριστική διαγραφή ακολουθεί τον έλεγχο. Χρησιμοποιήστε τον αριθμό αιτήματος για ενημέρωση ή υποστήριξη.|Αναφορά συναλλαγής|Περίοδος|Απόδειξη / τιμολόγιο|Δεν προσδιορίστηκε|Αναζήτηση σελίδων",
 sr: "Izvor oglasa uživo|Objavi odgovarajuće oglase za teret i vozila iz ovog razgovora javno na Logivya tržištu.|Čeka proveru|Na čekanju|Obrađuje se|Završeno|Delimično završeno|Neuspešno|Otkazano|Isteklo|Rok za otkazivanje|Vaš zahtev je primljen. Trajno brisanje sledi posle provere. Koristite broj zahteva za status ili podršku.|Referenca transakcije|Period|Potvrda / račun|Nije navedeno|Pretraži stranice",
};
export function productStatusCopy(locale: string) {
 const values = (rows[locale] ?? rows.en!).split("|");
 return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Record<typeof keys[number], string>;
}
import lifecycleExtra from './lifecycle-extra-locales.json';
export function lifecycleLabel(status: string, locale: string) {
 const extra: Record<string,string>=(lifecycleExtra as Record<string,Record<string,string>>)[locale] ?? lifecycleExtra.en;
 if (extra?.[status]) return extra[status];
 const copy = productStatusCopy(locale);
 const key: Record<string, keyof typeof copy> = { QUEUED: "queued", PENDING: "queued", RUNNING: "running", PROCESSING: "running", COMPLETED: "completed", SUCCEEDED: "completed", PARTIALLY_COMPLETED: "partial", PARTIAL: "partial", FAILED: "failed", CANCELED: "cancelled", CANCELLED: "cancelled", EXPIRED: "expired", LEGAL_REVIEW_REQUIRED: "review" };
 return copy[key[status] ?? "review"];
}
const options: Record<string, string> = {
 tr: "Frigo|Tenteli|Açık kasa|Kapalı kasa|Konteyner|Lowbed|Kamyon|Panelvan|Tam zamanlı|Yarı zamanlı|Sözleşmeli|Günlük",
 en: "Refrigerated|Curtainsider|Open trailer|Closed trailer|Container|Lowbed|Truck|Van|Full time|Part time|Contract|Daily",
 ar: "مبرد|ستائر جانبية|مقطورة مفتوحة|مقطورة مغلقة|حاوية|سطحة منخفضة|شاحنة|فان|دوام كامل|دوام جزئي|بعقد|يومي",
 uz: "Sovutkichli|Tentli|Ochiq kuzov|Yopiq kuzov|Konteyner|Past platformali|Yuk mashinasi|Furgon|To‘liq vaqt|Yarim vaqt|Shartnoma asosida|Kunlik",
 de: "Kühlfahrzeug|Planenauflieger|Offener Auflieger|Geschlossener Auflieger|Container|Tieflader|Lkw|Transporter|Vollzeit|Teilzeit|Vertrag|Tageseinsatz",
 ru: "Рефрижератор|Тент|Открытый прицеп|Закрытый прицеп|Контейнер|Низкорамный трал|Грузовик|Фургон|Полная занятость|Частичная занятость|По контракту|Посуточно",
 ro: "Frigorific|Prelată|Remorcă deschisă|Remorcă închisă|Container|Platformă joasă|Camion|Furgonetă|Normă întreagă|Normă parțială|Contract|Zilnic",
 az: "Soyuduculu|Tentli|Açıq kuzov|Qapalı kuzov|Konteyner|Alçaq platforma|Yük maşını|Furqon|Tam iş günü|Yarım iş günü|Müqaviləli|Gündəlik",
 tk: "Sowadyjyly|Tentli|Açyk kuzow|Ýapyk kuzow|Konteýner|Pes platforma|Ýük maşyny|Furgon|Doly iş wagty|Ýarym iş wagty|Şertnamaly|Gündelik",
 bg: "Хладилен|Брезентов|Отворено ремарке|Затворено ремарке|Контейнер|Нископлатформен|Камион|Бус|Пълен работен ден|Непълен работен ден|По договор|Дневно",
 el: "Ψυγείο|Μουσαμάς|Ανοιχτό ρυμουλκούμενο|Κλειστό ρυμουλκούμενο|Εμπορευματοκιβώτιο|Χαμηλή πλατφόρμα|Φορτηγό|Βαν|Πλήρης απασχόληση|Μερική απασχόληση|Σύμβαση|Ημερήσια",
 sr: "Hladnjača|Cerada|Otvorena prikolica|Zatvorena prikolica|Kontejner|Niska platforma|Kamion|Kombi|Puno radno vreme|Nepuno radno vreme|Ugovor|Dnevno",
};
const optionKeys = ["REFRIGERATED", "CURTAINSIDER", "OPEN_TRAILER", "CLOSED_TRAILER", "CONTAINER", "LOWBED", "TRUCK", "VAN", "FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"];
export function marketplaceOptionLabel(value: string, locale: string) {
 const code = value === "FLATBED" ? "OPEN_TRAILER" : value === "CLOSED_BODY" ? "CLOSED_TRAILER" : value;
 const index = optionKeys.indexOf(code);
 return index < 0 ? productStatusCopy(locale).notSpecified : ((options[locale] ?? options.en!).split("|")[index] ?? productStatusCopy(locale).notSpecified);
}
export function validateProductStatusCopy() {
 return Object.keys(rows).every(locale => rows[locale]!.split("|").length === keys.length && options[locale]!.split("|").length === optionKeys.length);
}
