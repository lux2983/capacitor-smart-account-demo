# capacitor-smart-account-demo

Standalone Capacitor reference app for Smart Account Kit + `capacitor-passkey-plugin`.

## Prerequisites

- Node.js 22+
- npm 10+
- Xcode (for iOS)
- Android SDK + Android Studio (for Android)

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

- The current npm release of `capacitor-passkey-plugin` (`0.0.5`) does not yet expose `./adapter` and `./storage` exports.
- This repo maps those import paths to local shims in `src/passkey/` via Vite alias until the next plugin npm release.

## Passkey Platform Config

- iOS associated domains are configured in `/ios/App/App/App.entitlements` for `webcredentials:soneso.com`.
- Android Digital Asset Links are configured via `asset_statements` in `/android/app/src/main/res/values/strings.xml` and `autoVerify` intent filter in `/android/app/src/main/AndroidManifest.xml`.
- Android permissions include biometric + NFC for hardware key scenarios.
- For physical iOS runs, set a valid signing team in Xcode and ensure `soneso.com` hosts the updated AASA file.
- For Android release builds, add the release keystore SHA-256 fingerprint to `soneso.com/.well-known/assetlinks.json`.

## Environment variables

See `.env.example` for required Smart Account Kit configuration values.
