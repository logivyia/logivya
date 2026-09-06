import assert from "node:assert/strict";
import { mobileCountryLabel } from "../src/features/freight/country-labels";
import { marketplaceCountries } from "../../../shared/marketplace-filters";

const descriptor = Object.getOwnPropertyDescriptor(Intl, "DisplayNames");
try {
  Object.defineProperty(Intl, "DisplayNames", { configurable: true, value: undefined });
  for (const locale of ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr", "uz"]) {
    for (const [code] of marketplaceCountries) assert.notEqual(mobileCountryLabel(code, locale), code);
  }
  assert.equal(mobileCountryLabel("UZ", "tr"), "Özbekistan");
  assert.equal(mobileCountryLabel("UZ", "uz"), "Oʻzbekiston");
  assert.equal(mobileCountryLabel("SA", "ar"), "المملكة العربية السعودية");
  assert.equal(mobileCountryLabel("AE", "en"), "United Arab Emirates");
  assert.equal(mobileCountryLabel("XX", "uz", "Unknown"), "Unknown");
  console.log("PASS: 12 languages and all marketplace countries work without Intl.DisplayNames (Hermes compatibility).");
} finally {
  if (descriptor) Object.defineProperty(Intl, "DisplayNames", descriptor);
}
