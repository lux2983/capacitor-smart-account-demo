import { SmartAccountKit } from 'smart-account-kit';
import { PasskeyPlugin } from 'capacitor-passkey-plugin';
import { asSimpleWebAuthn } from 'capacitor-passkey-plugin/adapter';
import { CapacitorStorageAdapter } from 'capacitor-passkey-plugin/storage';
import type { DemoConfig } from './config';

export function createKit(config: DemoConfig): SmartAccountKit {
  return new SmartAccountKit({
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    accountWasmHash: config.accountWasmHash,
    webauthnVerifierAddress: config.webauthnVerifierAddress,
    rpId: config.rpId,
    rpName: config.rpName,
    relayerUrl: config.relayerUrl || undefined,
    storage: new CapacitorStorageAdapter('smart-account-demo'),
    webAuthn: asSimpleWebAuthn(PasskeyPlugin),
  });
}
