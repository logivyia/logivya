import { Browsers, getPlatformId, type WABrowserDescription } from "@whiskeysockets/baileys";

const DEFAULT_CLIENT_NAME = "Chrome";
const DEFAULT_CLIENT_OS = "ubuntu";
const SAFE_CLIENT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;

type LinkedDeviceEnvironment = {
  WHATSAPP_LINKED_DEVICE_NAME?: string;
  WHATSAPP_PAIRING_BROWSER_NAME?: string;
  WHATSAPP_PAIRING_BROWSER_OS?: string;
};

export type WhatsAppLinkedDeviceMetadata = {
  browser: WABrowserDescription;
  clientName: string;
  companionPlatformId: string;
  companionPlatformDisplay: string;
  usedFallbackName: boolean;
};

function resolveClientName(environment: LinkedDeviceEnvironment) {
  const configured = environment.WHATSAPP_LINKED_DEVICE_NAME?.trim()
    || environment.WHATSAPP_PAIRING_BROWSER_NAME?.trim()
    || DEFAULT_CLIENT_NAME;

  if (!SAFE_CLIENT_NAME.test(configured)) {
    return { clientName: DEFAULT_CLIENT_NAME, usedFallbackName: true };
  }

  return { clientName: configured, usedFallbackName: false };
}

function resolveBrowser(clientName: string, configuredOs: string | undefined): WABrowserDescription {
  const os = (configuredOs || DEFAULT_CLIENT_OS).trim().toLowerCase();
  if (os === "macos") return Browsers.macOS(clientName);
  if (os === "windows") return Browsers.windows(clientName);
  return Browsers.ubuntu(clientName);
}

export function resolveWhatsAppLinkedDeviceMetadata(
  environment: LinkedDeviceEnvironment = process.env as LinkedDeviceEnvironment,
): WhatsAppLinkedDeviceMetadata {
  const { clientName, usedFallbackName } = resolveClientName(environment);
  const browser = resolveBrowser(clientName, environment.WHATSAPP_PAIRING_BROWSER_OS);

  return {
    browser,
    clientName,
    companionPlatformId: getPlatformId(browser[1]),
    companionPlatformDisplay: `${browser[1]} (${browser[0]})`,
    usedFallbackName,
  };
}
