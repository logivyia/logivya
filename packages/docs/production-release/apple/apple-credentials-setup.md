# Apple Credentials Setup

## Fixed application identity

- App name: `Logivya`
- App Store Connect Apple ID: `6792539737`
- Bundle identifier: `com.logivya.mobile`
- Apple Team ID: `YMW24BAWTV`
- EAS project: `@logivya/logivya-mobile`

Do not create a second identifier, certificate, provisioning profile, or App Store Connect app until the existing records have been audited.

## Required local environment

Set these as user or CI secret environment variables:

```text
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_API_KEY_PATH
APP_STORE_CONNECT_APP_ID
APP_STORE_APP_ID
APPLE_TEAM_ID
IOS_BUNDLE_IDENTIFIER
```

EAS also recognizes these aliases:

```text
EXPO_ASC_ISSUER_ID
EXPO_ASC_KEY_ID
EXPO_ASC_API_KEY_PATH
```

`APP_STORE_CONNECT_APP_ID` and its compatibility alias `APP_STORE_APP_ID` must both identify the existing verified app `6792539737`. The ID is not secret, but keeping it in release configuration prevents accidental uploads to another app record.

## Private-key storage

Store the `.p8` file outside the repository, for example:

```text
%USERPROFILE%\.appstoreconnect\private_keys\AuthKey_<KEY_ID>.p8
```

Restrict the directory and file ACL to the release operator. Never place the key in `apps/mobile`, an EAS project file, an environment file, an artifact directory, or a support ticket. Do not upload the key to GitHub.

Validate without printing any key material:

```powershell
npm run apple:validate-env
npm run release:secret-scan
```

## Credential roles

- App Store Connect API key: API authentication, app-record audit, provisioning automation, and submission authentication.
- Apple Distribution certificate: signs the iOS application binary.
- App Store provisioning profile: authorizes the signed binary for the bundle identifier and distribution channel.
- APNs key: authenticates push notification delivery. It is separate from the App Store Connect API key.

Prefer EAS-managed Distribution certificates and provisioning profiles. Never treat the `.p8` App Store Connect key as a signing certificate.

## Rotation and incident response

Do not revoke or replace a working key during routine setup. If exposure is proven, stop release work, record the affected key ID, revoke it in App Store Connect, create a replacement with the minimum required role, update secure environments, and rerun all validations.
