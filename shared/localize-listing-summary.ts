import { marketplaceOptionLabel } from './product-status-copy';
const vehicles: Record<string,string> = { Tenteli:'CURTAINSIDER', 'Açık Kasa':'OPEN_TRAILER', 'Kapalı Kasa':'CLOSED_TRAILER', Frigo:'REFRIGERATED', Konteyner:'CONTAINER', Lowbed:'LOWBED', Kamyon:'TRUCK', Panelvan:'VAN' };
const nouns:Record<string,string>={tr:'İlanı|araç',en:'listing|vehicles',ar:'إعلان|مركبات',uz:'e’loni|transport',de:'Inserat|Fahrzeuge',ru:'объявление|машин',ro:'anunț|vehicule',az:'elanı|nəqliyyat vasitəsi',tk:'bildirişi|ulag',bg:'обява|превозни средства',el:'αγγελία|οχήματα',sr:'oglas|vozila'};
type Summary = { publicTitle:string; vehicleDisplayName:string|null; publicAdvertiserName:string; loadingDisplayName:string|null; deliveryDisplayName:string|null; vehicleCountDisplay?:string|null };
/** Localize generated UI labels only. Descriptions, names and user-authored titles are preserved. */
export function localizeListingSummary<T extends Summary>(listing:T,locale:string):T {
 const [noun,countNoun]=(nouns[locale]??nouns.en!).split('|');
 const code=listing.vehicleDisplayName ? vehicles[listing.vehicleDisplayName] : undefined;
 const vehicleDisplayName=code?marketplaceOptionLabel(code,locale):listing.vehicleDisplayName;
 const route=[listing.loadingDisplayName,listing.deliveryDisplayName].filter(Boolean).join(' → ');
 const generatedTitle=route && listing.vehicleDisplayName && listing.publicTitle===`${route} ${listing.vehicleDisplayName}`;
 const publicTitle=generatedTitle?`${route} ${vehicleDisplayName}`:listing.publicTitle;
 const publicAdvertiserName=/^(WhatsApp|Telegram|Logivya) İlanı$/u.test(listing.publicAdvertiserName)?listing.publicAdvertiserName.replace('İlanı',noun!):listing.publicAdvertiserName;
 const vehicleCountDisplay=listing.vehicleCountDisplay?.replace(/ araç$/u,` ${countNoun}`)??listing.vehicleCountDisplay;
 return {...listing,publicTitle,vehicleDisplayName,publicAdvertiserName,vehicleCountDisplay};
}
