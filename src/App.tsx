import { useEffect, useMemo, useState } from 'react';
import { SmartAccountError, SmartAccountErrorCode, validateAddress, validateAmount } from 'smart-account-kit';
import type { TransactionResult } from 'smart-account-kit';
import { CapacitorStorageAdapter } from 'capacitor-passkey-plugin/storage';
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

const MAX_LOGS = 14;

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

function normalizeErrorMessage(operation: Operation, error: unknown): string {
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

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      setRestoring(true);

      try {
        const storage = new CapacitorStorageAdapter('smart-account-demo');
        const session = await storage.getSession();
        const hadExpiredSession = Boolean(session?.expiresAt && Date.now() > session.expiresAt);

        const connected = await kit.connectWallet();
        if (cancelled) {
          return;
        }

        if (connected) {
          setContractId(connected.contractId);
          setCredentialId(connected.credentialId);
          pushLog('Restored previous wallet session.', 'success');
          return;
        }

        if (hadExpiredSession) {
          pushLog('Previous session expired. Requesting interactive passkey authentication.', 'info');
          setBusy('reauth');
          try {
            const prompted = await kit.connectWallet({ prompt: true, fresh: true });
            if (prompted) {
              setContractId(prompted.contractId);
              setCredentialId(prompted.credentialId);
              pushLog(`Reconnected after session expiry: ${truncate(prompted.contractId)}`, 'success');
            } else {
              pushLog('No wallet selected after session expiry.', 'error');
            }
          } finally {
            if (!cancelled) {
              setBusy(null);
            }
          }

          return;
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

      const result = await kit.createWallet(config.rpName, trimmedName);
      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      setTransferState({ status: 'idle' });

      pushLog(`Wallet created: ${truncate(result.contractId)}`, 'success');
      if (result.submitResult?.success) {
        pushLog(`Deployment submitted: ${result.submitResult.hash}`, 'success');
      }
      if (result.submitResult && !result.submitResult.success) {
        pushLog(`Deployment failed: ${result.submitResult.error ?? 'unknown deployment error'}`, 'error');
      }
    });

  const handleConnectWallet = () =>
    runOperation('connect', async () => {
      const result = await kit.connectWallet({ prompt: true });
      if (!result) {
        throw new Error('No wallet connected.');
      }

      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      setTransferState({ status: 'idle' });
      pushLog(`Connected wallet: ${truncate(result.contractId)}`, 'success');
    });

  const handleTransfer = () =>
    runOperation('transfer', async () => {
      const trimmedRecipient = recipient.trim();
      const numericAmount = Number(amount);

      validateAddress(trimmedRecipient, 'recipient');
      validateAmount(numericAmount, 'amount');

      const result = await kit.transfer(config.nativeTokenContract, trimmedRecipient, numericAmount);
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
      await kit.disconnect();
      setContractId(null);
      setCredentialId(null);
      setTransferState({ status: 'idle' });
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
          <p><strong>RP:</strong> {config.rpName} ({config.rpId})</p>
          <p><strong>RPC:</strong> {config.rpcUrl}</p>
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
