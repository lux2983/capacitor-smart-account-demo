import { SmartAccountKit } from 'smart-account-kit';
import type { StorageAdapter, StoredCredential, StoredSession } from 'smart-account-kit';
import { PasskeyPlugin } from 'capacitor-passkey-plugin';
import { asSimpleWebAuthn } from 'capacitor-passkey-plugin/adapter';
import { CapacitorStorageAdapter } from 'capacitor-passkey-plugin/storage';
import type { DemoConfig } from './config';

const STORAGE_OP_TIMEOUT_MS = 8_000;
const WEBAUTHN_OP_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class MemoryStorageAdapter implements StorageAdapter {
  private readonly credentials = new Map<string, StoredCredential>();
  private session: StoredSession | null = null;

  async save(credential: StoredCredential): Promise<void> {
    this.credentials.set(credential.credentialId, credential);
  }

  async get(credentialId: string): Promise<StoredCredential | null> {
    return this.credentials.get(credentialId) ?? null;
  }

  async getByContract(contractId: string): Promise<StoredCredential[]> {
    return Array.from(this.credentials.values()).filter((item) => item.contractId === contractId);
  }

  async getAll(): Promise<StoredCredential[]> {
    return Array.from(this.credentials.values());
  }

  async delete(credentialId: string): Promise<void> {
    this.credentials.delete(credentialId);
  }

  async update(
    credentialId: string,
    updates: Partial<Omit<StoredCredential, 'credentialId' | 'publicKey'>>,
  ): Promise<void> {
    const current = this.credentials.get(credentialId);
    if (!current) {
      return;
    }

    this.credentials.set(credentialId, {
      ...current,
      ...updates,
      credentialId: current.credentialId,
      publicKey: current.publicKey,
    });
  }

  async clear(): Promise<void> {
    this.credentials.clear();
    this.session = null;
  }

  async saveSession(session: StoredSession): Promise<void> {
    this.session = session;
  }

  async getSession(): Promise<StoredSession | null> {
    return this.session;
  }

  async clearSession(): Promise<void> {
    this.session = null;
  }
}

export function createKit(config: DemoConfig): SmartAccountKit {
  const storage = new CapacitorStorageAdapter('smart-account-demo');
  const memoryStorage = new MemoryStorageAdapter();
  const webAuthn = asSimpleWebAuthn(PasskeyPlugin);
  let usingMemoryFallback = false;

  const runStorage = async <T>(
    label: string,
    persistentOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
  ): Promise<T> => {
    if (usingMemoryFallback) {
      return fallbackOperation();
    }

    try {
      return await withTimeout(persistentOperation(), STORAGE_OP_TIMEOUT_MS, label);
    } catch {
      usingMemoryFallback = true;
      console.warn(`[kit] ${label} failed or timed out. Falling back to in-memory storage for this app session.`);
      return fallbackOperation();
    }
  };

  return new SmartAccountKit({
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    accountWasmHash: config.accountWasmHash,
    webauthnVerifierAddress: config.webauthnVerifierAddress,
    rpId: config.rpId,
    rpName: config.rpName,
    relayerUrl: config.relayerUrl || undefined,
    storage: {
      save: (credential) =>
        runStorage('storage.save', () => storage.save(credential), () => memoryStorage.save(credential)),
      get: (credentialId) =>
        runStorage('storage.get', () => storage.get(credentialId), () => memoryStorage.get(credentialId)),
      getByContract: (contractId) =>
        runStorage(
          'storage.getByContract',
          () => storage.getByContract(contractId),
          () => memoryStorage.getByContract(contractId),
        ),
      getAll: () =>
        runStorage('storage.getAll', () => storage.getAll(), () => memoryStorage.getAll()),
      delete: (credentialId) =>
        runStorage('storage.delete', () => storage.delete(credentialId), () => memoryStorage.delete(credentialId)),
      update: (credentialId, updates) =>
        runStorage(
          'storage.update',
          () => storage.update(credentialId, updates),
          () => memoryStorage.update(credentialId, updates),
        ),
      clear: () =>
        runStorage('storage.clear', () => storage.clear(), () => memoryStorage.clear()),
      saveSession: (session) =>
        runStorage(
          'storage.saveSession',
          () => storage.saveSession(session),
          () => memoryStorage.saveSession(session),
        ),
      getSession: () =>
        runStorage('storage.getSession', () => storage.getSession(), () => memoryStorage.getSession()),
      clearSession: () =>
        runStorage(
          'storage.clearSession',
          () => storage.clearSession(),
          () => memoryStorage.clearSession(),
        ),
    },
    webAuthn: {
      startRegistration: (args) =>
        withTimeout(
          webAuthn.startRegistration(args),
          WEBAUTHN_OP_TIMEOUT_MS,
          'webAuthn.startRegistration',
        ),
      startAuthentication: (args) =>
        withTimeout(
          webAuthn.startAuthentication(args),
          WEBAUTHN_OP_TIMEOUT_MS,
          'webAuthn.startAuthentication',
        ),
    },
  });
}
