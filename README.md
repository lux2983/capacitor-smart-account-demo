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

## Environment variables

See `.env.example` for required Smart Account Kit configuration values.
