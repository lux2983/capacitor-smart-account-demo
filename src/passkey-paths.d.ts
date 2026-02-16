declare module 'capacitor-passkey-plugin/adapter' {
  export { asSimpleWebAuthn } from './passkey/adapter';
}

declare module 'capacitor-passkey-plugin/storage' {
  export { CapacitorStorageAdapter } from './passkey/storage';
  export type { StorageAdapter, StoredCredential, StoredSession } from 'smart-account-kit';
}
