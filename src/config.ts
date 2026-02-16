export type DemoConfig = {
  rpcUrl: string;
  networkPassphrase: string;
  accountWasmHash: string;
  webauthnVerifierAddress: string;
  nativeTokenContract: string;
  thresholdPolicyAddress?: string;
  spendingLimitPolicyAddress?: string;
  weightedThresholdPolicyAddress?: string;
  relayerUrl?: string;
  rpId: string;
  rpName: string;
};

const TESTNET_DEFAULTS = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  accountWasmHash: 'a12e8fa9621efd20315753bd4007d974390e31fbcb4a7ddc4dd0a0dec728bf2e',
  webauthnVerifierAddress: 'CBSHV66WG7UV6FQVUTB67P3DZUEJ2KJ5X6JKQH5MFRAAFNFJUAJVXJYV',
  nativeTokenContract: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  thresholdPolicyAddress: 'CCT4MMN5MJ6O2OU6LXPYTCVORQ2QVTBMDJ7MYBZQ2ULSYQVUIYP4IFYD',
  spendingLimitPolicyAddress: 'CBMMWY54XOV6JJHSWCMKWWPXVRXASR5U26UJMLZDN4SP6CFFTVZARPTY',
  weightedThresholdPolicyAddress: 'CBYDQ5XUBP7G24FI3LLGLW56QZCIEUSVRPX7FVOUCKHJQQ6DTF6BQGBZ',
  rpId: 'soneso.com',
  rpName: 'Smart Account Demo',
} as const;

function readEnv(name: keyof ImportMetaEnv, fallback: string = ''): string {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function getConfig(): DemoConfig {
  return {
    rpcUrl: readEnv('VITE_RPC_URL', TESTNET_DEFAULTS.rpcUrl),
    networkPassphrase: readEnv('VITE_NETWORK_PASSPHRASE', TESTNET_DEFAULTS.networkPassphrase),
    accountWasmHash: readEnv('VITE_ACCOUNT_WASM_HASH', TESTNET_DEFAULTS.accountWasmHash),
    webauthnVerifierAddress: readEnv('VITE_WEBAUTHN_VERIFIER_ADDRESS', TESTNET_DEFAULTS.webauthnVerifierAddress),
    nativeTokenContract: readEnv('VITE_NATIVE_TOKEN_CONTRACT', TESTNET_DEFAULTS.nativeTokenContract),
    thresholdPolicyAddress: readEnv('VITE_THRESHOLD_POLICY_ADDRESS', TESTNET_DEFAULTS.thresholdPolicyAddress),
    spendingLimitPolicyAddress: readEnv('VITE_SPENDING_LIMIT_POLICY_ADDRESS', TESTNET_DEFAULTS.spendingLimitPolicyAddress),
    weightedThresholdPolicyAddress: readEnv(
      'VITE_WEIGHTED_THRESHOLD_POLICY_ADDRESS',
      TESTNET_DEFAULTS.weightedThresholdPolicyAddress,
    ),
    relayerUrl: readEnv('VITE_RELAYER_URL'),
    rpId: readEnv('VITE_RP_ID', TESTNET_DEFAULTS.rpId),
    rpName: readEnv('VITE_RP_NAME', TESTNET_DEFAULTS.rpName),
  };
}
