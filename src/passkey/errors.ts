export type PluginErrorCode =
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

export class PasskeyError extends Error {
  readonly pluginErrorCode: string;
  override readonly name: string;

  constructor(name: string, message: string, pluginErrorCode: string) {
    super(message);
    this.name = name;
    this.pluginErrorCode = pluginErrorCode;
  }
}

const ERROR_NAME_MAP: Record<PluginErrorCode, string> = {
  UNKNOWN_ERROR: 'UnknownError',
  CANCELLED: 'NotAllowedError',
  DOM_ERROR: 'NotAllowedError',
  UNSUPPORTED_ERROR: 'NotSupportedError',
  TIMEOUT: 'AbortError',
  NO_CREDENTIAL: 'NotAllowedError',
  INVALID_INPUT: 'TypeError',
  RPID_VALIDATION_ERROR: 'SecurityError',
  PROVIDER_CONFIG_ERROR: 'InvalidStateError',
  INTERRUPTED: 'AbortError',
  NO_ACTIVITY: 'InvalidStateError',
};

function toPluginErrorCode(value: unknown): PluginErrorCode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return (Object.keys(ERROR_NAME_MAP) as PluginErrorCode[]).find((key) => key === value);
}

export function mapPluginError(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) {
    return error;
  }

  const anyError = error as { code?: unknown; message?: unknown };
  const pluginCode = toPluginErrorCode(anyError?.code) ?? 'UNKNOWN_ERROR';
  const name = ERROR_NAME_MAP[pluginCode] ?? 'UnknownError';
  const message = typeof anyError?.message === 'string' ? anyError.message : 'Passkey operation failed';

  return new PasskeyError(name, message, pluginCode);
}
