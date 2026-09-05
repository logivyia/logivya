# App Store Connect API Validation

## Safe validation command

```powershell
npm run apple:audit
```

The command creates a short-lived ES256 JWT only in memory. It uses the `appstoreconnect-v1` audience, performs GET requests only, redacts private material, and does not create or update Apple records.

## Verified on 2026-07-19

- Authentication: passed
- HTTP status: `200`
- Permission inferred: App Store Connect app and bundle-identifier read access
- Bundle ID record: exists for `com.logivya.mobile`
- App Store Connect app record: `6792539737`, `Logivya`, `com.logivya.mobile`, SKU `LOGIVYA001`, locale `en-US`
- iOS version: `1.0`, `PREPARE_FOR_SUBMISSION`
- Existing TestFlight build: `1.0 (136)`, build resource `5ccd2e83-7618-4769-a85e-56ea201bb6e5`, processing state `VALID`
- App Privacy completion: manual verification required; the read-only app endpoints do not prove questionnaire completion
- Agreements status: not exposed by these read-only endpoints; verify manually

The exact API-key role is not returned by the app-list endpoint. Do not infer write or administrative access from a successful read.

## TestFlight deployment verified on 2026-07-20

- EAS build: `d770c759-bbfc-4cc7-adb6-ca38a7e7fa7e`, status `FINISHED`
- EAS submission: `bdc52140-218b-4a20-ab18-5dcb69f7642a`, upload accepted by App Store Connect
- Internal group: `Logivya Internal QA`, resource `7664d31e-aebc-4d99-a5af-0af5ee2df91e`
- Public link: disabled
- External distribution: unchanged
- Internal build state: `IN_BETA_TESTING`
- First internal tester: invited and linked to the internal group

## Verified identity contract

`npm run apple:audit` must continue to return:

- Apple ID: `6792539737`
- Name: `Logivya`
- Bundle ID: `com.logivya.mobile`
- SKU: `LOGIVYA001`
- Primary locale: `en-US`
- iOS version: `1.0`

The numeric ID is configured through `APP_STORE_CONNECT_APP_ID` with `APP_STORE_APP_ID` as a compatibility alias. Never hardcode API key material in `eas.json`.

## Failure handling

- `401`: verify issuer ID, key ID, key path, key format, system time, and key revocation status.
- `403`: the key lacks the required role or resource access.
- `404`: verify the endpoint and resource ID; do not create replacement records automatically.
- More than one matching app: stop and resolve ownership with Apple Support before building.
