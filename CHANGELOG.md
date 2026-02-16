# Changelog

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
