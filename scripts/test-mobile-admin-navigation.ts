import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { getStateFromPath } from "../apps/mobile/node_modules/@react-navigation/core/lib/module/index.js";
import { CommonActions, StackActions, StackRouter } from "../apps/mobile/node_modules/@react-navigation/routers/lib/module/index.js";
import { parseMarketplaceLinkIdentifier } from "../apps/mobile/src/navigation/marketplace-link-context";
import {
  adminNotificationOperationsLinking,
  normalizeAdminNotificationPath,
} from "../apps/mobile/src/navigation/admin-notification-links";

type NavigationState = {
  routes?: Array<{
    name?: string;
    params?: Record<string, unknown>;
    state?: NavigationState;
  }>;
};

// Read the shipping linking config, replacing only the native re-export for Node.
const linkingModule = { exports: {} as any };
runInNewContext(ts.transpileModule(readFileSync("apps/mobile/src/navigation/linking.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: linkingModule.exports,
  require: (name: string) => {
    if (name === "@react-navigation/native") return { getStateFromPath };
    if (name.endsWith("admin-notification-links")) return { adminNotificationOperationsLinking, normalizeAdminNotificationPath };
    if (name.endsWith("marketplace-link-context")) return { parseMarketplaceLinkIdentifier };
    throw new Error(`Unexpected navigation dependency: ${name}`);
  },
});
const linking = linkingModule.exports.linking;

function adminRoute(path: string) {
  const state = linking.getStateFromPath(path, linking.config) as NavigationState | undefined;
  const menu = state?.routes?.find((route) => route.name === "More");
  assert.equal(menu?.state?.routes?.[0]?.name, "AdminSections", "Cold links must retain the administrator directory as a back destination");
  return menu?.state?.routes?.at(-1);
}

assert.equal(
  normalizeAdminNotificationPath("/admin/announcements?source=push"),
  "profile/admin/notifications/announcements?source=push",
  "The web announcement URL must target the notification operations announcement tab",
);

for (const path of [
  "/admin/notifications",
  "/profile/admin/notifications",
]) {
  assert.equal(
    adminRoute(path)?.name,
    "AdminNotificationOperations",
    `${path} must not be consumed by the generic PlatformModule route`,
  );
}

for (const path of [
  "/admin/announcements",
  "/admin/notifications/announcements",
  "/profile/admin/notifications/announcements",
]) {
  const route = adminRoute(path);
  assert.equal(route?.name, "AdminNotificationOperations");
  assert.equal(
    route?.params?.initialTab,
    "announcements",
    `${path} must open the announcement operations tab`,
  );
}

assert.equal(
  adminRoute("/admin/notifications/not-a-real-tab")?.params?.initialTab,
  "dashboard",
  "Unknown notification tabs must fail closed to the operations dashboard",
);

const supportRoute = adminRoute("/profile/admin/support/TICKET-42");
assert.equal(
  supportRoute?.name,
  "PlatformModule",
  "Other administrator module links must keep using the generic module route",
);
assert.equal(supportRoute?.params?.moduleKey, "support");
assert.equal(supportRoute?.params?.ticketId, "TICKET-42");

console.log("Mobile administrator deep-link contracts passed.");

const navigatorSource = readFileSync("apps/mobile/src/navigation/more-navigator.tsx", "utf8");
const initialRouteName = navigatorSource.match(/initialRouteName="(\w+)"/)?.[1];
const routeNames = [...navigatorSource.matchAll(/<Stack.Screen name="(\w+)"/g)].map((match) => match[1]);
assert.equal(initialRouteName, "AdminSections");
assert.match(readFileSync("apps/mobile/src/navigation/app-navigator.tsx", "utf8"), /name="More" component=\{MoreNavigator\}/);
const router = StackRouter({ initialRouteName });
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
const moreSource = readFileSync("apps/mobile/src/screens/app/more-screen.tsx", "utf8");
const sourceFile = ts.createSourceFile("more.tsx", moreSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let openModuleSource = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "openModule") openModuleSource = node.getText(sourceFile);
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(openModuleSource, "The directory must have an administrator navigation action");
const moduleKeys = [...moreSource.matchAll(/key: "(\w+)"/g)].map((match) => match[1]);
assert.equal(moduleKeys.length, 30, "Exercise every administrator menu entry");
for (const moduleKey of moduleKeys) {
  let state = router.getInitialState(options);
  const directoryKey = state.routes[0].key;
  const navigation = {
    push: (name: string, params: object) => {
      const next = router.getStateForAction(state, StackActions.push(name, params), options);
      assert.ok(next, `${moduleKey} must stay in the directory stack`);
      state = next;
    },
  };
  runInNewContext(ts.transpileModule(`${openModuleSource}\nopenModule(moduleKey);`, {}).outputText, { navigation, moduleKey });
  assert.equal(state.index, 1, `${moduleKey} must open above its directory`);
  const afterBack = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(afterBack?.routes[afterBack.index].name, "AdminSections", `${moduleKey}: Android/iOS back must return to the directory`);
  assert.equal(afterBack?.routes[0].key, directoryKey, "Returning must retain the mounted directory and scroll position");
  if (moduleKey !== "notifications" && moduleKey !== "announcements") {
    assert.equal(adminRoute(`/profile/admin/${moduleKey}`)?.params?.moduleKey, moduleKey);
  }
}

let nested = router.getInitialState(options);
for (const params of [{ moduleKey: "companies", initialSearch: "example" }, { moduleKey: "users", initialStatus: "ACTIVE" }]) {
  nested = router.getStateForAction(nested, StackActions.push("PlatformModule", params), options)!;
}
const parent = router.getStateForAction(nested, CommonActions.goBack(), options)!;
assert.equal(parent.routes[parent.index].params?.moduleKey, "companies", "Back from a related module must first return to its caller");
assert.equal(parent.routes[parent.index].params?.initialSearch, "example", "Back must retain the caller's filters");
const reopened = router.getStateForAction(nested, CommonActions.navigate("AdminSections", undefined, { pop: true }), options)!;
assert.equal(reopened.index, 0, "Selecting the drawer's admin entry must return to the directory without duplicates");
const profile = linking.getStateFromPath("/profile/subscription", linking.config);
assert.equal(profile.routes[0].name, "Profile", "Non-admin profile links must retain their existing destination");
console.log("All 30 admin menu/back paths, nested returns, cold links and directory re-entry passed.");
