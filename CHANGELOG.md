# Changelog

## [0.2.2] - 2026-02-16

### Changed
- Added iOS associated domains entitlement (`webcredentials:soneso.com`) and enabled entitlements in Xcode build settings.
- Added iOS Face ID usage description for passkey authentication prompts.
- Added Android Digital Asset Links wiring (`asset_statements` + `autoVerify` intent filter for `soneso.com`).
- Added Android biometric and NFC permissions for passkey and hardware key scenarios.
- Switched default `rpId` to `soneso.com` for mobile debug alignment with hosted `.well-known` files.

## [0.2.1] - 2026-02-16

### Changed
- Hardened wallet operation flows with explicit operation-state handling and banner-level error feedback.
- Added session-expiry fallback behavior to trigger interactive reconnect when an expired stored session is detected.
- Improved transfer UX with strict recipient/amount validation and structured last-transfer result details (hash/ledger/error).
- Expanded log entries with timestamps and clearer operation-scoped error messages.

## [0.2.0] - 2026-02-16

### Added
- React + Vite + Capacitor app scaffold for standalone Smart Account reference app.
- Smart Account Kit integration wired with `asSimpleWebAuthn(PasskeyPlugin)`.
- Capacitor Preferences-backed storage via `CapacitorStorageAdapter`.
- Core demo flows: create wallet, connect wallet, transfer, disconnect.
- Environment-driven configuration and `.env.example` for testnet defaults.
- Native platform setup for iOS and Android via Capacitor.
- Compatibility patch script for current `capacitor-passkey-plugin@0.0.5` iOS SPM integration.

## [0.1.0] - 2026-02-16

### Added
- Initial repository scaffold for standalone Smart Account Kit demo app.
