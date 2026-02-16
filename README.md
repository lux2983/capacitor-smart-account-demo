# capacitor-smart-account-demo

Standalone Capacitor reference app for Smart Account Kit + `capacitor-passkey-plugin`.

## Current Status

- This project is in pre-release testing and external review.
- Planned release window: March 2026.
- Do not treat this repository as a final production release yet.

## Prerequisites

- Node.js 22+
- npm 10+
- Xcode (for iOS)
- Android SDK + Android Studio (for Android)

### Android Local Build Environment

Set Android SDK environment variables before running Android verification locally:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Build web assets:
   ```bash
   npm run build
   ```
4. Sync Capacitor platforms:
   ```bash
   npm run sync
   ```

## Development

- Run web dev server: `npm run dev`
- Build: `npm run build`
- Open iOS: `npm run open:ios`
- Open Android: `npm run open:android`

## Notes

- This demo intentionally pins a vendored plugin tarball at `vendor/capacitor-passkey-plugin-1.0.0.tgz`.
- This avoids npm publishing requirements while still consuming the Smart Account adapter/storage exports from the forked plugin code.

## Developer Notes

- This demo currently depends on a vendored plugin tarball, not the npm registry package.
- If plugin code changes, update the tarball in this repo:
  1. In the plugin repo, run `npm pack`.
  2. Copy the generated `capacitor-passkey-plugin-1.0.0.tgz` into `vendor/` in this demo repo.
  3. Run `npm install`.
  4. Run `npm run sync`.
  5. Re-run native verification (`npm run verify:ios` and `npm run verify:android`).
- On a fresh machine, the first Android verify run downloads the Gradle wrapper from `services.gradle.org`, so network access is required for that first run.
- Passkey domain validation on real devices requires control over the configured RP domain.
- This demo is configured for `soneso.com`; if you use another domain, update env/config plus iOS Associated Domains and Android Digital Asset Links for that domain.
- For reviewer handoff, use this baseline sequence:
  1. `npm ci`
  2. `npm run build`
  3. `npm run sync`
  4. `npm run verify:ios`
  5. `npm run verify:android`

## Passkey Platform Config

- iOS associated domains are configured in `/ios/App/App/App.entitlements` for `webcredentials:soneso.com`.
- Android Digital Asset Links are configured via `asset_statements` in `/android/app/src/main/res/values/strings.xml` and `autoVerify` intent filter in `/android/app/src/main/AndroidManifest.xml`.
- Android permissions include biometric + NFC for hardware key scenarios.
- For physical iOS runs, set a valid signing team in Xcode and ensure `soneso.com` hosts the updated AASA file.
- For Android release builds, add the release keystore SHA-256 fingerprint to `soneso.com/.well-known/assetlinks.json`.

## Environment variables

See `.env.example` for required Smart Account Kit configuration values.
