import { useEffect, useMemo, useState } from 'react';
import { SmartAccountError, SmartAccountErrorCode, validateAddress, validateAmount } from 'smart-account-kit';
import type { TransactionResult } from 'smart-account-kit';
import { Address, rpc, xdr } from '@stellar/stellar-sdk';
import { createKit } from './kit';
import { getConfig } from './config';

type LogType = 'info' | 'success' | 'error';

type LogEntry = {
  message: string;
  type: LogType;
  timestamp: string;
};

type Operation = 'restore' | 'reauth' | 'create' | 'connect' | 'transfer' | 'disconnect';
type PluginErrorCode =
  | 'UNKNOWN_ERROR'
  | 'CANCELLED'
  | 'DOM_ERROR'
  | 'UNSUPPORTED_ERROR'
  | 'TIMEOUT'
  | 'NO_CREDENTIAL'
  | 'INVALID_INPUT'
  | 'RPID_VALIDATION_ERROR'
  | 'PROVIDER_CONFIG_ERROR'
  | 'INTERRUPTED'
  | 'NO_ACTIVITY';

type TransferState =
  | { status: 'idle' }
  | {
      status: 'success';
      hash: string;
      ledger?: number;
      amount: number;
      recipient: string;
    }
  | {
      status: 'error';
      error: string;
      amount: number;
      recipient: string;
      hash?: string;
    };

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; valueXlm: string; updatedAt: number }
  | { status: 'error'; error: string };

const MAX_LOGS = 14;
const RESTORE_TIMEOUT_MS = 10_000;
const REAUTH_TIMEOUT_MS = 30_000;
const CREATE_TIMEOUT_MS = 90_000;
const CONNECT_TIMEOUT_MS = 45_000;
const TRANSFER_TIMEOUT_MS = 60_000;
const DISCONNECT_TIMEOUT_MS = 10_000;
const BALANCE_TIMEOUT_MS = 15_000;
const SESSION_SNAPSHOT_KEY = 'smart-account-demo:session-snapshot:v1';
const STROOPS_PER_XLM = 10_000_000n;

class OperationTimeoutError extends Error {
  readonly operation: Operation;
  readonly timeoutMs: number;

  constructor(operation: Operation, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

type SessionSnapshot = {
  contractId: string;
  credentialId: string;
  updatedAt: number;
};

function nowTime(): string {
  return new Date().toLocaleTimeString();
}

function truncate(value: string, size: number = 10): string {
  if (value.length <= size * 2) {
    return value;
  }

  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') {
      return value;
    }
  }

  return 'Passkey operation failed';
}

function getPluginErrorCode(error: unknown): PluginErrorCode | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const value =
    (error as { pluginErrorCode?: unknown }).pluginErrorCode ??
    (error as { code?: unknown }).code;

  const knownCodes: PluginErrorCode[] = [
    'UNKNOWN_ERROR',
    'CANCELLED',
    'DOM_ERROR',
    'UNSUPPORTED_ERROR',
    'TIMEOUT',
    'NO_CREDENTIAL',
    'INVALID_INPUT',
    'RPID_VALIDATION_ERROR',
    'PROVIDER_CONFIG_ERROR',
    'INTERRUPTED',
    'NO_ACTIVITY',
  ];

  if (typeof value !== 'string' || !knownCodes.includes(value as PluginErrorCode)) {
    return undefined;
  }

  return value as PluginErrorCode;
}

async function withOperationTimeout<T>(
  promise: Promise<T>,
  operation: Operation,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new OperationTimeoutError(operation, timeoutMs));
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

function normalizeErrorMessage(operation: Operation, error: unknown): string {
  if (error instanceof OperationTimeoutError) {
    switch (error.operation) {
      case 'restore':
        return 'Session restore timed out. You can continue manually.';
      case 'reauth':
        return 'Re-authentication timed out. Try Connect Wallet again.';
      case 'create':
        return 'Wallet creation timed out. Check passkey prompt visibility and network/relayer status, then retry.';
      case 'connect':
        return 'Wallet connection timed out. Try Connect Wallet again.';
      case 'transfer':
        return 'Transfer timed out before confirmation. Check network status and retry.';
      case 'disconnect':
        return 'Disconnect timed out. Try again.';
      default:
        return `${error.operation} timed out. Please retry.`;
    }
  }

  const pluginErrorCode = getPluginErrorCode(error);
  if (pluginErrorCode) {
    switch (pluginErrorCode) {
      case 'CANCELLED':
      case 'DOM_ERROR':
      case 'NO_CREDENTIAL':
        return 'Passkey request was cancelled or no credential was selected.';
      case 'TIMEOUT':
        return 'Passkey request timed out. Try again.';
      case 'RPID_VALIDATION_ERROR':
        return 'Passkey rpId validation failed. Check app rpId, associated domains, and asset links.';
      case 'PROVIDER_CONFIG_ERROR':
        return 'Passkey provider is not configured on this device.';
      case 'UNSUPPORTED_ERROR':
        return 'Passkeys are not supported on this device configuration.';
      case 'INVALID_INPUT':
        return `Invalid input for ${operation}: ${getErrorMessage(error)}`;
      default:
        return getErrorMessage(error);
    }
  }

  if (error instanceof SmartAccountError) {
    switch (error.code) {
      case SmartAccountErrorCode.INVALID_ADDRESS:
        return 'Invalid Stellar address. Use a valid G... or C... address.';
      case SmartAccountErrorCode.INVALID_AMOUNT:
        return 'Invalid amount. Enter a positive numeric value.';
      case SmartAccountErrorCode.WALLET_NOT_CONNECTED:
        return 'No wallet connected. Connect a wallet before this action.';
      case SmartAccountErrorCode.TRANSACTION_TIMEOUT:
        return 'Transaction confirmation timed out.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('contract not found on-chain')) {
      return 'Wallet contract is not deployed on-chain yet. Create and deploy a wallet first.';
    }
    return error.message;
  }

  return 'Unknown error';
}

function toTransferError(result: TransactionResult): string {
  if (result.error) {
    return result.error;
  }

  return 'Transfer failed with an unknown error.';
}

function formatStroopsAsXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS_PER_XLM;
  const fractionalRaw = (absolute % STROOPS_PER_XLM).toString().padStart(7, '0');
  const fractional = fractionalRaw.replace(/0+$/, '');

  return `${negative ? '-' : ''}${whole.toString()}${fractional ? `.${fractional}` : ''}`;
}

function getUnknownErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return fallback;
}

function isMissingBalanceError(error: unknown): boolean {
  const message = getUnknownErrorMessage(error, '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('resource missing') ||
    message.includes('missing entry') ||
    message.includes('missingvalue') ||
    message.includes('entry does not exist') ||
    message.includes('ledger entry')
  );
}

async function fetchNativeBalanceXlm(
  rpcUrl: string,
  nativeTokenContract: string,
  ownerAddress: string,
): Promise<string> {
  const server = new rpc.Server(rpcUrl);
  const owner = Address.fromString(ownerAddress);
  const balanceKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Balance'),
    xdr.ScVal.scvAddress(owner.toScAddress()),
  ]);

  try {
    const balanceData = await withTimeout(
      server.getContractData(nativeTokenContract, balanceKey),
      BALANCE_TIMEOUT_MS,
      'balance query',
    );
    const value = balanceData.val.contractData().val();

    if (value.switch().name === 'scvI128') {
      const i128 = value.i128();
      const hi = BigInt(i128.hi().toString());
      const lo = BigInt(i128.lo().toString());
      const stroops = (hi << 64n) + lo;
      return formatStroopsAsXlm(stroops);
    }

    if (value.switch().name === 'scvU128') {
      const u128 = value.u128();
      const hi = BigInt(u128.hi().toString());
      const lo = BigInt(u128.lo().toString());
      const stroops = (hi << 64n) + lo;
      return formatStroopsAsXlm(stroops);
    }

    if (value.switch().name === 'scvI64') {
      return formatStroopsAsXlm(BigInt(value.i64().toString()));
    }

    if (value.switch().name === 'scvU64') {
      return formatStroopsAsXlm(BigInt(value.u64().toString()));
    }

    if (value.switch().name === 'scvI32') {
      return formatStroopsAsXlm(BigInt(value.i32()));
    }

    if (value.switch().name === 'scvU32') {
      return formatStroopsAsXlm(BigInt(value.u32()));
    }

    if (value.switch().name === 'scvVoid') {
      return '0';
    }

    {
      throw new Error(`Unexpected balance value type: ${value.switch().name}`);
    }
  } catch (error) {
    if (isMissingBalanceError(error)) {
      return '0';
    }
    throw new Error(getUnknownErrorMessage(error, 'Failed to load balance'));
  }
}

function readSessionSnapshot(): SessionSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (typeof parsed.contractId !== 'string' || typeof parsed.credentialId !== 'string') {
      return null;
    }

    return {
      contractId: parsed.contractId,
      credentialId: parsed.credentialId,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeSessionSnapshot(contractId: string, credentialId: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({
        contractId,
        credentialId,
        updatedAt: Date.now(),
      } satisfies SessionSnapshot),
    );
  } catch {
    // Best-effort cache only; ignore localStorage failures.
  }
}

function clearSessionSnapshot(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_SNAPSHOT_KEY);
    }
  } catch {
    // Ignore localStorage failures on cleanup.
  }
}

export function App() {
  const config = useMemo(() => getConfig(), []);
  const kit = useMemo(() => createKit(config), [config]);

  const [userName, setUserName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [contractId, setContractId] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [transferState, setTransferState] = useState<TransferState>({ status: 'idle' });
  const [balance, setBalance] = useState<BalanceState>({ status: 'idle' });

  const pushLog = (message: string, type: LogType = 'info') => {
    setLogs((current) => [{ message, type, timestamp: nowTime() }, ...current].slice(0, MAX_LOGS));
  };

  const runOperation = async (operation: Operation, handler: () => Promise<void>) => {
    if (busy) {
      return;
    }

    setBusy(operation);
    setErrorBanner(null);

    try {
      await handler();
    } catch (error) {
      const message = normalizeErrorMessage(operation, error);
      setErrorBanner(message);
      pushLog(`${operation}: ${message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const refreshBalance = async (targetContractId: string, logErrors: boolean = false) => {
    setBalance({ status: 'loading' });

    try {
      const valueXlm = await fetchNativeBalanceXlm(
        config.rpcUrl,
        config.nativeTokenContract,
        targetContractId,
      );
      setBalance({
        status: 'ready',
        valueXlm,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const message = getUnknownErrorMessage(error, 'Failed to load balance');
      setBalance({ status: 'error', error: message });
      if (logErrors) {
        pushLog(`balance: ${message}`, 'error');
      }
    }
  };

  useEffect(() => {
    const appendEventLog = (message: string, type: LogType) => {
      setLogs((current) => [{ message, type, timestamp: nowTime() }, ...current].slice(0, MAX_LOGS));
    };

    const unsubscribers = [
      kit.events.on('credentialCreated', ({ credential }) => {
        appendEventLog(`event: credentialCreated (${truncate(credential.credentialId)})`, 'info');
      }),
      kit.events.on('walletConnected', ({ contractId, credentialId }) => {
        appendEventLog(
          `event: walletConnected (${truncate(contractId)} / ${truncate(credentialId)})`,
          'success',
        );
      }),
      kit.events.on('transactionSubmitted', ({ hash, success }) => {
        appendEventLog(
          `event: transactionSubmitted (${success ? 'success' : 'failed'} / ${hash})`,
          success ? 'success' : 'error',
        );
      }),
      kit.events.on('sessionExpired', ({ contractId, credentialId }) => {
        appendEventLog(
          `event: sessionExpired (${truncate(contractId)} / ${truncate(credentialId)})`,
          'info',
        );
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [kit]);

  useEffect(() => {
    if (!contractId) {
      setBalance({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setBalance({ status: 'loading' });

    void (async () => {
      try {
        const valueXlm = await fetchNativeBalanceXlm(
          config.rpcUrl,
          config.nativeTokenContract,
          contractId,
        );

        if (cancelled) {
          return;
        }

        setBalance({
          status: 'ready',
          valueXlm,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = getUnknownErrorMessage(error, 'Failed to load balance');
        setBalance({ status: 'error', error: message });
        pushLog(`balance: ${message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contractId, config.nativeTokenContract, config.rpcUrl]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      setRestoring(true);

      try {
        const connected = await withOperationTimeout(kit.connectWallet(), 'restore', RESTORE_TIMEOUT_MS);
        if (cancelled) {
          return;
        }

        if (connected) {
          setContractId(connected.contractId);
          setCredentialId(connected.credentialId);
          writeSessionSnapshot(connected.contractId, connected.credentialId);
          pushLog('Restored previous wallet session.', 'success');
          return;
        }

        const snapshot = readSessionSnapshot();
        if (snapshot) {
          pushLog('No SDK session found. Trying local restore snapshot.', 'info');
          const snapshotConnected = await withOperationTimeout(
            kit.connectWallet({
              credentialId: snapshot.credentialId,
              contractId: snapshot.contractId,
            }),
            'restore',
            RESTORE_TIMEOUT_MS,
          );
          if (cancelled) {
            return;
          }

          if (snapshotConnected) {
            setContractId(snapshotConnected.contractId);
            setCredentialId(snapshotConnected.credentialId);
            writeSessionSnapshot(snapshotConnected.contractId, snapshotConnected.credentialId);
            pushLog(`Restored via snapshot: ${truncate(snapshotConnected.contractId)}`, 'success');
            return;
          }
        }

        pushLog('No previous session found. Connect or create a wallet.', 'info');
      } catch (error) {
        if (!cancelled) {
          const message = normalizeErrorMessage('restore', error);
          setErrorBanner(message);
          pushLog(`restore: ${message}`, 'error');
        }
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [kit]);

  const handleCreateWallet = () =>
    runOperation('create', async () => {
      const trimmedName = userName.trim();
      if (!trimmedName) {
        throw new Error('Enter a username before creating a wallet.');
      }

      pushLog('Starting wallet creation (passkey + deployment)...', 'info');
      const result = await withOperationTimeout(
        kit.createWallet(config.rpName, trimmedName, {
          autoSubmit: true,
          autoFund: true,
          nativeTokenContract: config.nativeTokenContract,
        }),
        'create',
        CREATE_TIMEOUT_MS,
      );
      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      writeSessionSnapshot(result.contractId, result.credentialId);
      setTransferState({ status: 'idle' });
      void refreshBalance(result.contractId);

      pushLog(`Wallet created: ${truncate(result.contractId)}`, 'success');
      if (result.submitResult?.success) {
        pushLog(`Deployment submitted: ${result.submitResult.hash}`, 'success');
      }
      if (result.submitResult && !result.submitResult.success) {
        pushLog(`Deployment failed: ${result.submitResult.error ?? 'unknown deployment error'}`, 'error');
      }
      if (result.fundResult?.success) {
        pushLog(`Wallet funded: ${result.fundResult.amount ?? 'unknown'} XLM`, 'success');
      }
      if (result.fundResult && !result.fundResult.success) {
        pushLog(`Funding failed: ${result.fundResult.error ?? 'unknown funding error'}`, 'error');
      }
    });

  const handleConnectWallet = () =>
    runOperation('connect', async () => {
      const result = await withOperationTimeout(
        kit.connectWallet({ prompt: true }),
        'connect',
        CONNECT_TIMEOUT_MS,
      );
      if (!result) {
        throw new Error('No wallet connected.');
      }

      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      writeSessionSnapshot(result.contractId, result.credentialId);
      setTransferState({ status: 'idle' });
      void refreshBalance(result.contractId);
      pushLog(`Connected wallet: ${truncate(result.contractId)}`, 'success');
    });

  const handleTransfer = () =>
    runOperation('transfer', async () => {
      const trimmedRecipient = recipient.trim();
      const numericAmount = Number(amount);

      validateAddress(trimmedRecipient, 'recipient');
      validateAmount(numericAmount, 'amount');

      const result = await withOperationTimeout(
        kit.transfer(config.nativeTokenContract, trimmedRecipient, numericAmount),
        'transfer',
        TRANSFER_TIMEOUT_MS,
      );
      if (result.success) {
        setTransferState({
          status: 'success',
          hash: result.hash,
          ledger: result.ledger,
          amount: numericAmount,
          recipient: trimmedRecipient,
        });

        pushLog(
          `Transfer submitted (${numericAmount} XLM -> ${truncate(trimmedRecipient)}): ${result.hash}`,
          'success',
        );
        if (contractId) {
          void refreshBalance(contractId);
        }
        return;
      }

      const transferError = toTransferError(result);
      setTransferState({
        status: 'error',
        error: transferError,
        amount: numericAmount,
        recipient: trimmedRecipient,
        hash: result.hash || undefined,
      });

      throw new Error(transferError);
    });

  const handleDisconnect = () =>
    runOperation('disconnect', async () => {
      await withOperationTimeout(kit.disconnect(), 'disconnect', DISCONNECT_TIMEOUT_MS);
      setContractId(null);
      setCredentialId(null);
      clearSessionSnapshot();
      setTransferState({ status: 'idle' });
      setBalance({ status: 'idle' });
      pushLog('Disconnected from wallet.', 'success');
    });

  const isBusy = busy !== null;
  const isConnected = Boolean(contractId && credentialId);

  return (
    <main className="page">
      <section className="card">
        <h1>Smart Account Demo</h1>
        <p className="muted">Capacitor + Smart Account Kit + Passkey Plugin</p>

        {errorBanner ? <p className="banner error">{errorBanner}</p> : null}
        {busy ? <p className="banner info">Running: {busy}</p> : null}
        {!busy && restoring ? <p className="banner info">Restoring previous session...</p> : null}

        <div className="grid">
          <label>
            <span>Username</span>
            <input
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="alice@example.com"
              disabled={isBusy}
            />
          </label>

          <button onClick={handleCreateWallet} disabled={isBusy}>
            {busy === 'create' ? 'Creating...' : 'Create Wallet'}
          </button>

          <button onClick={handleConnectWallet} disabled={isBusy}>
            {busy === 'connect' || busy === 'reauth' ? 'Connecting...' : 'Connect Wallet'}
          </button>

          <label>
            <span>Recipient</span>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="C... or G..."
              disabled={isBusy || !isConnected}
            />
          </label>

          <label>
            <span>Amount (XLM)</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              disabled={isBusy || !isConnected}
            />
          </label>

          <button onClick={handleTransfer} disabled={isBusy || !isConnected}>
            {busy === 'transfer' ? 'Sending...' : 'Send Transfer'}
          </button>

          <button onClick={handleDisconnect} disabled={isBusy || !isConnected}>
            {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>

        <div className="status">
          <p><strong>Contract:</strong> {contractId ?? 'Not connected'}</p>
          <p><strong>Credential:</strong> {credentialId ?? 'Not connected'}</p>
          <p>
            <strong>Balance:</strong>{' '}
            {balance.status === 'idle' ? 'Not connected' : null}
            {balance.status === 'loading' ? 'Loading...' : null}
            {balance.status === 'ready' ? `${balance.valueXlm} XLM` : null}
            {balance.status === 'error' ? `Error: ${balance.error}` : null}
          </p>
          <p><strong>RP:</strong> {config.rpName} ({config.rpId})</p>
          <p><strong>RPC:</strong> {config.rpcUrl}</p>
          <button
            className="balance-refresh"
            onClick={() => {
              if (contractId) {
                void refreshBalance(contractId, true);
              }
            }}
            disabled={isBusy || !isConnected || balance.status === 'loading'}
          >
            {balance.status === 'loading' ? 'Refreshing Balance...' : 'Refresh Balance'}
          </button>
        </div>

        <div className="status transfer-status">
          <p><strong>Last Transfer:</strong></p>
          {transferState.status === 'idle' ? <p>None</p> : null}
          {transferState.status === 'success' ? (
            <>
              <p>{transferState.amount} XLM to {transferState.recipient}</p>
              <p>Hash: {transferState.hash}</p>
              <p>Ledger: {transferState.ledger ?? 'Pending'}</p>
            </>
          ) : null}
          {transferState.status === 'error' ? (
            <>
              <p>{transferState.amount} XLM to {transferState.recipient}</p>
              <p>Error: {transferState.error}</p>
              <p>Hash: {transferState.hash ?? 'n/a'}</p>
            </>
          ) : null}
        </div>
      </section>

      <section className="card logs">
        <h2>Event Log</h2>
        <ul>
          {logs.map((entry, index) => (
            <li key={`${entry.timestamp}-${entry.message}-${index}`} className={entry.type}>
              <span className="timestamp">{entry.timestamp}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
