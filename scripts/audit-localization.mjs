import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const targetLocales = ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"];
const visibleAttributes = new Set(["alt", "aria-label", "description", "label", "placeholder", "title"]);
const ignoredText = /^(?:[-+×•·/|]|(?:←\s*)?Logivya(?: Mobile)?|LOGIVYA ·|MB|WhatsApp|Android|iOS|API|URL|QR|IBAN|ISO-8601|https?:\/\/\.\.\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}|[\w./-]+\.(?:md|json|ts|tsx))$/i;
const protectedTerms = /\b(?:Logivya|WhatsApp|Telegram|PayTR|Iyzico|Stripe|Android|iOS|API|QR|IBAN|ISO-8601|URL|KVKK|SaaS|JWT|Redis|Prisma|Vercel|Cloudflare|Render|Expo|Google Play)\b/gi;
const turkishResidue = /[ĞğİıŞş]|\b(?:kullanıcı|şirket|ayarlar|kaydet|başarısız|başarılı|ödeme|abonelik|deneme|destek|hesaplar|gruplar|kategoriler|gönder|bağlantı|yeniden|silindi|iptal edildi|bulunamadı|yüklenemedi|geçersiz)\b/i;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "android", "i18n"].includes(entry.name)) return [];
      return walk(absolute);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [absolute] : [];
  });
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function compact(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isVisibleText(value) {
  const text = compact(value);
  return text.length > 1 && /\p{L}/u.test(text) && !ignoredText.test(text);
}

function callName(expression) {
  return expression.getText().replace(/\s+/g, "");
}

function auditSource(file, dictionaries) {
  const source = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const missingKeys = [];

  function add(node, kindName, text) {
    if (!isVisibleText(text)) return;
    findings.push({ file: path.relative(root, file), line: lineOf(sourceFile, node), kind: kindName, text: compact(text) });
  }

  function visit(node) {
    if (ts.isJsxText(node)) add(node, "jsx-text", node.getText(sourceFile));

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sourceFile);
      if (visibleAttributes.has(name)) add(node, `jsx-${name}`, node.initializer.text);
    }

    if (ts.isConditionalExpression(node) && /\bisTr\b/.test(node.condition.getText(sourceFile))) {
      findings.push({ file: path.relative(root, file), line: lineOf(sourceFile, node), kind: "isTr-conditional", text: compact(node.getText(sourceFile)) });
    }

    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (/^(?:Alert\.alert|window\.(?:alert|confirm|prompt)|(?:alert|confirm|prompt))$/.test(name)) {
        for (const argument of node.arguments) {
          if (ts.isStringLiteralLike(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) add(argument, `call-${name}`, argument.text);
        }
      }

      const keyArgument = name === "t" || name.endsWith(".t") || name === "translateCurrent"
        ? node.arguments[0]
        : name === "translate" || name === "translateForLocale"
          ? node.arguments[1]
          : undefined;
      if (keyArgument && ts.isStringLiteralLike(keyArgument)) {
        const domain = file.includes(`${path.sep}apps${path.sep}mobile${path.sep}`) ? "mobile" : "web";
        if (!(keyArgument.text in dictionaries[domain])) {
          missingKeys.push({ file: path.relative(root, file), line: lineOf(sourceFile, keyArgument), key: keyArgument.text, domain });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { findings, missingKeys };
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

function hasQuestionMarkCorruption(source, value) {
  const sourceCount = (String(source).match(/\?/g) ?? []).length;
  const valueCount = (String(value).match(/\?/g) ?? []).length;
  return valueCount > sourceCount;
}

const nativeIdenticalValues = {
  ro: new Set(["Administrator", "Operator", "Popular", "Urgent", "Plan", "Manual", "Individual", "Marketing", "Total", "Export", "Feedback", "Manager", "Normal", "Document", "Interval: 1"]),
  ru: new Set(),
  az: new Set(["Status", "Operator", "Plan", "Normal", "Video"]),
  tk: new Set(["Status", "Operator"]),
  de: new Set(["Support", "Status", "Administrator", "Operator", "System", "Start", "Ticket", "Name", "Marketing", "Information", "Version", "Export", "Compliance", "Feedback", "Manager", "Tickets", "Orange", "Normal", "Team", "Video"]),
  bg: new Set(),
  el: new Set(),
  sr: new Set(["Status", "Administrator", "Plan", "Marketing", "Video", "Interval: 1"]),
};

function allowedIdentical(value, locale) {
  const stripped = String(value).replace(protectedTerms, "").replace(/[\d\s\p{P}\p{S}]/gu, "");
  const normalized = String(value).trim();
  return !stripped
    || /^(?:\{[^{}]+\}[\s\p{P}]*)+$/u.test(normalized)
    || /^(?:Ctrl K|5x{2} x{3} x{2} x{2}|\d+\s*(?:TL|TRY|₺)|Starter|Webhook|Webhooks|Professional|Enterprise|Logivya (?:Mobile|Plus|Pro))$/i.test(normalized)
    || nativeIdenticalValues[locale]?.has(normalized);
}

function catalogQuality(locale, english, dictionary) {
  const placeholderMismatch = [];
  const encodingErrors = [];
  const questionMarkCorruption = [];
  const identicalEnglish = [];
  const turkishLeftovers = [];
  const serbianCyrillic = [];
  for (const [key, englishValue] of Object.entries(english)) {
    const value = dictionary[key];
    if (JSON.stringify(placeholders(englishValue)) !== JSON.stringify(placeholders(value))) placeholderMismatch.push(key);
    if (hasQuestionMarkCorruption(englishValue, value)) questionMarkCorruption.push(key);
    if (/(?:Ã¼|Ã§|Ã¶|Ã¢|Ä±|ÄŸ|Äƒ|ÅŸ|Åž|â€™|â€“|Â|\uFFFD)/.test(String(value ?? ""))) encodingErrors.push(key);
    if (!["en", "tr"].includes(locale) && value === englishValue && !allowedIdentical(value, locale)) identicalEnglish.push(key);
    const containsRequiredTurkishLegalIdentity = ["legal.privacy.controllerBody", "legal.kvkk.controllerBody"].includes(key);
    if (["en", "ro", "ru", "de", "bg", "el", "sr"].includes(locale) && !containsRequiredTurkishLegalIdentity && turkishResidue.test(String(value ?? ""))) turkishLeftovers.push(key);
    if (locale === "sr" && /[\u0400-\u04ff]/.test(String(value ?? ""))) serbianCyrillic.push(key);
  }
  return { placeholderMismatch, encodingErrors, questionMarkCorruption, identicalEnglish, turkishLeftovers, serbianCyrillic };
}

function extractMobileBase() {
  const file = path.join(root, "apps", "mobile", "src", "i18n", "translations.ts");
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "baseTranslations") initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  while (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
  const result = {};
  for (const localeProperty of initializer?.properties ?? []) {
    if (!ts.isPropertyAssignment(localeProperty) || !ts.isObjectLiteralExpression(localeProperty.initializer)) continue;
    const locale = localeProperty.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
    if (!["tr", "en"].includes(locale)) continue;
    result[locale] = {};
    for (const item of localeProperty.initializer.properties) {
      if (!ts.isPropertyAssignment(item) || !ts.isStringLiteralLike(item.initializer)) continue;
      const key = item.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
      result[locale][key] = item.initializer.text;
    }
  }
  return result;
}

function auditCatalogDirectory(english, directory, inlineCatalogs = {}) {
  const englishKeys = Object.keys(english);
  return targetLocales.map((locale) => {
    const file = path.join(directory, `${locale}.json`);
    const dictionary = inlineCatalogs[locale] ?? (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
    if (!dictionary) return { locale, missingFile: true, missing: englishKeys.length, extra: 0, empty: 0, quality: null };
    const keys = Object.keys(dictionary);
    return {
      locale,
      missingFile: false,
      missing: englishKeys.filter((key) => !(key in dictionary)).length,
      extra: keys.filter((key) => !(key in english)).length,
      empty: keys.filter((key) => typeof dictionary[key] !== "string" || !dictionary[key].trim()).length,
      quality: catalogQuality(locale, english, dictionary),
    };
  });
}

function dictionaryAudit() {
  const localeDirectory = path.join(root, "packages", "locales");
  const englishPath = path.join(localeDirectory, "en.json");
  if (!fs.existsSync(englishPath)) return [];
  const english = JSON.parse(fs.readFileSync(englishPath, "utf8"));
  return auditCatalogDirectory(english, localeDirectory);
}

function mobileDictionaryAudit() {
  const base = extractMobileBase();
  return auditCatalogDirectory(base.en, path.join(root, "apps", "mobile", "src", "i18n", "locales"), { en: base.en, tr: base.tr });
}

const matchArgument = process.argv.find((argument) => argument.startsWith("--match="));
const match = matchArgument?.slice("--match=".length).toLowerCase();
const webEnglish = JSON.parse(fs.readFileSync(path.join(root, "packages", "locales", "en.json"), "utf8"));
const mobileBase = extractMobileBase();
const sourceFiles = [path.join(root, "src"), path.join(root, "apps", "mobile", "src")]
  .flatMap(walk)
  .filter((file) => !match || path.relative(root, file).toLowerCase().includes(match));
const sourceAudit = sourceFiles.map((file) => auditSource(file, { web: webEnglish, mobile: mobileBase.en }));
const findings = sourceAudit.flatMap((result) => result.findings);
const missingKeys = sourceAudit.flatMap((result) => result.missingKeys);
const groupedFindings = findings.reduce((groups, finding) => {
  (groups[finding.file] ??= []).push(finding);
  return groups;
}, {});
const byFile = Object.entries(groupedFindings)
  .map(([file, items]) => ({ file, count: items.length, findings: items }))
  .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

const report = { dictionaries: dictionaryAudit(), mobileDictionaries: mobileDictionaryAudit(), totalFindings: findings.length, missingKeys, files: byFile };
const output = process.argv.includes("--summary")
  ? { dictionaries: report.dictionaries, mobileDictionaries: report.mobileDictionaries, totalFindings: report.totalFindings, missingKeyCount: missingKeys.length, files: byFile.map(({ file, count }) => ({ file, count })) }
  : report;
console.log(JSON.stringify(output, null, 2));

if (process.argv.includes("--check")) {
  const catalogFailure = [...report.dictionaries, ...report.mobileDictionaries].some((item) => {
    const quality = item.quality;
    return item.missingFile || item.missing || item.extra || item.empty
      || (quality && Object.values(quality).some((values) => values.length));
  });
  if (catalogFailure || findings.length || missingKeys.length) process.exitCode = 1;
}
