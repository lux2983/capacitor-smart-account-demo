import { useEffect, useMemo, useState } from 'react';
import { createKit } from './kit';
import { getConfig } from './config';

type LogType = 'info' | 'success' | 'error';

type LogEntry = {
  message: string;
  type: LogType;
};

const MAX_LOGS = 12;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export function App() {
  const config = useMemo(() => getConfig(), []);
  const kit = useMemo(() => createKit(config), [config]);

  const [userName, setUserName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [contractId, setContractId] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const pushLog = (message: string, type: LogType = 'info') => {
    setLogs((current) => [{ message, type }, ...current].slice(0, MAX_LOGS));
  };

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      setBusy('restore');
      try {
        const connected = await kit.connectWallet();
        if (cancelled) {
          return;
        }

        if (connected) {
          setContractId(connected.contractId);
          setCredentialId(connected.credentialId);
          pushLog('Restored previous wallet session.', 'success');
        } else {
          pushLog('No previous session found. Connect or create a wallet.', 'info');
        }
      } catch (error) {
        if (!cancelled) {
          pushLog(`Session restore failed: ${toErrorMessage(error)}`, 'error');
        }
      } finally {
        if (!cancelled) {
          setBusy(null);
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [kit]);

  const handleCreateWallet = async () => {
    const trimmedName = userName.trim();
    if (!trimmedName) {
      pushLog('Enter a username before creating a wallet.', 'error');
      return;
    }

    setBusy('create');
    try {
      const result = await kit.createWallet(config.rpName, trimmedName);
      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      pushLog(`Wallet created: ${result.contractId}`, 'success');
    } catch (error) {
      pushLog(`Create wallet failed: ${toErrorMessage(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleConnectWallet = async () => {
    setBusy('connect');
    try {
      const result = await kit.connectWallet({ prompt: true });
      if (!result) {
        pushLog('No wallet connected.', 'error');
        return;
      }

      setContractId(result.contractId);
      setCredentialId(result.credentialId);
      pushLog(`Connected to wallet: ${result.contractId}`, 'success');
    } catch (error) {
      pushLog(`Connect wallet failed: ${toErrorMessage(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleTransfer = async () => {
    const numericAmount = Number(amount);
    if (!recipient.trim()) {
      pushLog('Enter a recipient address before sending.', 'error');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      pushLog('Amount must be a positive number.', 'error');
      return;
    }

    setBusy('transfer');
    try {
      const result = await kit.transfer(config.nativeTokenContract, recipient.trim(), numericAmount);
      if (result.success) {
        pushLog(`Transfer submitted: ${result.hash}`, 'success');
      } else {
        pushLog(`Transfer failed: ${result.error ?? 'Unknown transfer error'}`, 'error');
      }
    } catch (error) {
      pushLog(`Transfer error: ${toErrorMessage(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    try {
      await kit.disconnect();
      setContractId(null);
      setCredentialId(null);
      pushLog('Disconnected from wallet.', 'success');
    } catch (error) {
      pushLog(`Disconnect failed: ${toErrorMessage(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;

  return (
    <main className="page">
      <section className="card">
        <h1>Smart Account Demo</h1>
        <p className="muted">Capacitor + Smart Account Kit + Passkey Plugin</p>

        <div className="grid">
          <label>
            <span>Username</span>
            <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="alice@example.com" />
          </label>

          <button onClick={handleCreateWallet} disabled={isBusy}>
            {busy === 'create' ? 'Creating...' : 'Create Wallet'}
          </button>

          <button onClick={handleConnectWallet} disabled={isBusy}>
            {busy === 'connect' ? 'Connecting...' : 'Connect Wallet'}
          </button>

          <label>
            <span>Recipient</span>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="C... or G..." />
          </label>

          <label>
            <span>Amount (XLM)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>

          <button onClick={handleTransfer} disabled={isBusy || !contractId}>
            {busy === 'transfer' ? 'Sending...' : 'Send Transfer'}
          </button>

          <button onClick={handleDisconnect} disabled={isBusy || !contractId}>
            {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>

        <div className="status">
          <p><strong>Contract:</strong> {contractId ?? 'Not connected'}</p>
          <p><strong>Credential:</strong> {credentialId ?? 'Not connected'}</p>
          <p><strong>RP:</strong> {config.rpName} ({config.rpId})</p>
          <p><strong>RPC:</strong> {config.rpcUrl}</p>
        </div>
      </section>

      <section className="card logs">
        <h2>Event Log</h2>
        <ul>
          {logs.map((entry, index) => (
            <li key={`${entry.message}-${index}`} className={entry.type}>
              {entry.message}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
