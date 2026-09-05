"""Reject release AABs that break Expo's persisted/reflected task class names."""

import argparse
import json
import re
import zipfile
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("artifact", type=Path, help="Signed AAB or R8 mapping.txt")
parser.add_argument("--secure-store", action="store_true",
                    help="Also check the SecureStore/Expo Kotlin reflection boundary.")
args = parser.parse_args()

if args.artifact.suffix == ".aab":
    with zipfile.ZipFile(args.artifact) as bundle:
        mapping = bundle.read(
            "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"
        ).decode("utf-8")
else:
    mapping = args.artifact.read_text(encoding="utf-8")

classes = {}
current = None
for line in mapping.splitlines():
    header = re.fullmatch(r"([^\s].*?) -> (.+):", line)
    if header:
        current = header.group(1)
        classes[current] = {"target": header.group(2), "members": [], "synthesized": False}
    elif current and line.startswith('# {"id":"com.android.tools.r8.synthesized"}'):
        # Only unindented, class-level R8 metadata identifies a generated class.
        # Generated lambdas/outlines have no persisted pre-build class name.
        classes[current]["synthesized"] = True
    elif current and line.startswith("    "):
        classes[current]["members"].append(line.strip())

# These entry points were missing/renamed in v214 and failed on a real v213 upgrade.
required = {
    "expo.modules.adapters.react.apploader.RNHeadlessAppLoader":
        "void <init>(android.content.Context)",
    "expo.modules.notifications.notifications.background.BackgroundRemoteNotificationTaskConsumer":
        "void <init>(android.content.Context,expo.modules.interfaces.taskManager.TaskManagerUtilsInterface)",
    "expo.modules.taskManager.TaskService": "void <init>(android.content.Context)",
}
protected_prefixes = ("expo.modules.notifications.", "expo.modules.taskManager.")
if args.secure_store:
    required.update({
        "expo.modules.securestore.SecureStoreOptions": "void <init>()",
        "expo.modules.securestore.SecureStoreModule": "void <init>()",
        "expo.modules.kotlin.records.RecordTypeConverter":
            "void <init>(expo.modules.kotlin.types.TypeConverterProvider,kotlin.reflect.KType)",
        "expo.modules.kotlin.allocators.ObjectConstructorFactory": "void <init>()",
        "kotlin.reflect.jvm.internal.ReflectionFactoryImpl": "void <init>()",
    })
    protected_prefixes += ("expo.modules.securestore.", "expo.modules.kotlin.", "kotlin.reflect.")
checks = []
for name, constructor in required.items():
    entry = classes.get(name)
    checks.append({
        "class": name,
        "present": entry is not None,
        "namePreserved": bool(entry and entry["target"] == name),
        "constructorPreserved": bool(entry and any(
            constructor in member and member.endswith(" -> <init>")
            for member in entry["members"]
        )),
    })

renamed = [name for name, entry in classes.items()
           if name.startswith(protected_prefixes)
           and entry["target"] != name and not entry["synthesized"]]
synthesized = [name for name, entry in classes.items()
               if name.startswith(protected_prefixes)
               and entry["synthesized"]]
passed = all(all(check[key] for key in (
    "present", "namePreserved", "constructorPreserved"
)) for check in checks) and not renamed
print(json.dumps({
    "artifact": str(args.artifact),
    "passed": passed,
    "checks": checks,
    "secureStoreBoundaryChecked": args.secure_store,
    "renamedProtectedClasses": len(renamed),
    "compilerGeneratedClassesExcluded": len(synthesized),
    "note": "Artifact check only; device startup, task restoration, secure storage, and sign-in still require runtime testing.",
}, indent=2))
raise SystemExit(0 if passed else 1)
