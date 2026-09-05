import process from "node:process";
import {
  AppleConfigurationError,
  loadAppleConfiguration,
  safeConfigurationSummary,
} from "./app-store-connect-client.mjs";

try {
  const configuration = loadAppleConfiguration();
  const easAliasesConfigured = ["EXPO_ASC_API_KEY_PATH", "EXPO_ASC_KEY_ID", "EXPO_ASC_ISSUER_ID"].every(
    (name) => Boolean(process.env[name]?.trim()),
  );
  console.log(JSON.stringify({ ok: true, ...safeConfigurationSummary(configuration), easAliasesConfigured }, null, 2));
} catch (error) {
  const message = error instanceof AppleConfigurationError ? error.message : "Apple environment validation failed.";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(2);
}
