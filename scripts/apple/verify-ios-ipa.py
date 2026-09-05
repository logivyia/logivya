"""Read-only verification of an EAS IPA; does not replace Apple's signature validation."""
import argparse
import datetime
import hashlib
import json
import plistlib
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("ipa", type=Path)
parser.add_argument("--version", required=True)
parser.add_argument("--build", required=True)
args = parser.parse_args()

with zipfile.ZipFile(args.ipa) as archive:
    paths = archive.namelist()
    roots = [p for p in paths if p.startswith("Payload/") and p.count("/") == 2 and p.endswith(".app/Info.plist")]
    assert len(roots) == 1, "Expected exactly one main app"
    root = roots[0].removesuffix("Info.plist")
    info = plistlib.loads(archive.read(roots[0]))
    assert info["CFBundleIdentifier"] == "com.logivya.mobile", "Wrong app identity"
    assert info["CFBundleShortVersionString"] == args.version, "Wrong marketing version"
    assert info["CFBundleVersion"] == args.build, "Wrong build number"
    config = json.loads(archive.read(root + "EXConstants.bundle/app.config"))
    assert config.get("version") == args.version, "Wrong embedded Expo version"
    assert config.get("ios", {}).get("buildNumber") == args.build, "Wrong embedded Expo build"
    assert info.get("ITSAppUsesNonExemptEncryption") is False, "Review export compliance"
    assert not info.get("NSAppTransportSecurity", {}).get("NSAllowsArbitraryLoads", False), "Unrestricted transport"
    profile_data = archive.read(root + "embedded.mobileprovision")
    start = profile_data.index(b"<?xml")
    end = profile_data.index(b"</plist>", start) + len(b"</plist>")
    profile = plistlib.loads(profile_data[start:end])
    entitlements = profile["Entitlements"]
    assert entitlements["application-identifier"] == "YMW24BAWTV.com.logivya.mobile", "Wrong provisioning identity"
    assert entitlements.get("get-task-allow") is False, "Development provisioning"
    assert entitlements.get("aps-environment") == "production", "Non-production push entitlement"
    assert profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), "Expired profile"
    assert "ProvisionedDevices" not in profile, "Not App Store provisioning"
    assert root + "_CodeSignature/CodeResources" in paths, "Missing code signature resources"
    privacy_path = root + "PrivacyInfo.xcprivacy"
    privacy = plistlib.loads(archive.read(privacy_path))
    assert isinstance(privacy, dict), "Missing privacy manifest"
    bundle = archive.read(root + "main.jsbundle")
    assert b"ios-update-now" in bundle and b"ios-update-later" in bundle, "Update prompt missing from bundle"

print(json.dumps({
    "ok": True,
    "file": args.ipa.name,
    "bytes": args.ipa.stat().st_size,
    "sha256": hashlib.sha256(args.ipa.read_bytes()).hexdigest(),
    "bundle": info["CFBundleIdentifier"],
    "version": info["CFBundleShortVersionString"],
    "build": info["CFBundleVersion"],
    "minimumIOS": info.get("MinimumOSVersion"),
    "productionProvisioning": True,
    "privacyManifest": True,
    "updatePromptBundled": True,
    "embeddedReleaseMarker": config.get("extra", {}).get("buildMarker"),
    "signatureNote": "Signature resources and profile inspected; cryptographic validation is performed by Apple upload processing."
}, indent=2))
