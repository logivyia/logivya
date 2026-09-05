import AsyncStorage from "@react-native-async-storage/async-storage";

const RECOVERY_CONTEXT_KEY = "LOGIVYA_MOBILE_RECOVERY_CONTEXT";
const RECOVERY_CONTEXT_TTL_MS = 24 * 60 * 60_000;

type PersistedRecoveryContext = {
  id: string;
  createdAt: number;
};

let currentRecovery: PersistedRecoveryContext | null = null;
let currentRoute = "/mobile";

function validRecoveryId(value: unknown): value is string {
  return (
    typeof value === "string"
    && /^mobile-recovery-[a-z0-9]+-[a-z0-9-]{6,48}$/i.test(value)
  );
}

function isCurrent(value: PersistedRecoveryContext) {
  return Date.now() - value.createdAt <= RECOVERY_CONTEXT_TTL_MS;
}

export function createMobileRecoveryId() {
  const shortId = Math.random().toString(36).slice(2, 10);
  return `mobile-recovery-${Date.now().toString(36)}-${shortId}`;
}

export function rememberMobileRecoveryIncident(id: string) {
  if (!validRecoveryId(id)) return;
  currentRecovery = { id, createdAt: Date.now() };
  void AsyncStorage.setItem(
    RECOVERY_CONTEXT_KEY,
    JSON.stringify(currentRecovery),
  ).catch(() => undefined);
}

export async function hydrateMobileRecoveryContext() {
  try {
    const stored = await AsyncStorage.getItem(RECOVERY_CONTEXT_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : null;
    if (
      parsed
      && typeof parsed === "object"
      && "id" in parsed
      && "createdAt" in parsed
      && validRecoveryId(parsed.id)
      && typeof parsed.createdAt === "number"
      && isCurrent(parsed as PersistedRecoveryContext)
    ) {
      currentRecovery = parsed as PersistedRecoveryContext;
      return;
    }
    currentRecovery = null;
    await AsyncStorage.removeItem(RECOVERY_CONTEXT_KEY);
  } catch {
    currentRecovery = null;
  }
}

export function getCurrentMobileRecoveryId() {
  if (!currentRecovery || !isCurrent(currentRecovery)) return null;
  return currentRecovery.id;
}

export function setCurrentMobileRoute(routeName?: string) {
  const normalized = routeName
    ?.trim()
    .replace(/[^A-Za-z0-9._/-]/g, "")
    .slice(0, 120);
  currentRoute = normalized ? `/mobile/${normalized}` : "/mobile";
}

export function getCurrentMobileRoute() {
  return currentRoute;
}
