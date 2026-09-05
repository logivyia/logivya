"""Read-only inspection of a built AAB. Mapping ratios are not Play Console scores."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--aab", type=Path, required=True)
parser.add_argument("--baseline", type=Path)
parser.add_argument("--report", type=Path)
args = parser.parse_args()


def inspect(bundle):
    with bundle.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    with zipfile.ZipFile(bundle) as archive:
        entries = archive.infolist()
        mapping_path = "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"
        mapping = archive.read(mapping_path).decode("utf-8") if mapping_path in archive.namelist() else ""
        classes = re.findall(r"^(\S+) -> (\S+):\r?$", mapping, re.MULTILINE)
        renamed = sum(original != obfuscated for original, obfuscated in classes)
        return {
            "file": str(bundle.resolve()),
            "sha256": digest,
            "bundleBytes": bundle.stat().st_size,
            "dexBytes": sum(entry.file_size for entry in entries if re.fullmatch(r"base/dex/classes\d*\.dex", entry.filename)),
            "dexFiles": sum(bool(re.fullmatch(r"base/dex/classes\d*\.dex", entry.filename)) for entry in entries),
            "mappingEmbedded": bool(mapping),
            "mappedClasses": len(classes),
            "renamedClasses": renamed,
            "renamedMappingPercent": round(renamed * 100 / len(classes), 2) if classes else None,
            "mappingHeader": [line for line in mapping.splitlines()[:12] if line.startswith("#")],
        }


result = {"artifact": inspect(args.aab), "note": "The mapping percentage is a local proxy, not Google's app optimization score. Device testing and Play re-analysis are still required."}
if args.baseline:
    result["baseline"] = inspect(args.baseline)
    for field in ("bundleBytes", "dexBytes"):
        before = result["baseline"][field]
        result[field + "ReductionPercent"] = round((before - result["artifact"][field]) * 100 / before, 2) if before else None
artifact = result["artifact"]
if not artifact["mappingEmbedded"] or not artifact["renamedClasses"] or not artifact["dexBytes"]:
    raise SystemExit("FAIL: AAB has no embedded R8 mapping, renamed classes, or DEX payload")
result["status"] = "PASS"
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
