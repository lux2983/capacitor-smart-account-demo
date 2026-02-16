import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { mapPluginError } from './errors';

type PluginLike = {
  createPasskey(options: { publicKey: unknown }): Promise<{
    id: string;
    rawId: string;
    type?: string;
    authenticatorAttachment?: string;
    clientExtensionResults?: Record<string, unknown>;
    response: {
      attestationObject: string;
      clientDataJSON: string;
      authenticatorData?: string;
      transports?: string[];
      publicKey?: string;
      publicKeyAlgorithm?: number;
    };
  }>;
  authenticate(options: { publicKey: unknown }): Promise<{
    id: string;
    rawId: string;
    type?: string;
    authenticatorAttachment?: string;
    clientExtensionResults?: Record<string, unknown>;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
  }>;
};

type Attachment = 'platform' | 'cross-platform';

function normalizeAttachment(value?: string): Attachment | undefined {
  if (value === 'platform' || value === 'cross-platform') {
    return value;
  }

  return undefined;
}

function normalizeTransports(value?: string[]): AuthenticatorTransportFuture[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  return value as AuthenticatorTransportFuture[];
}

function normalizeUserHandle(value?: string): string | undefined {
  if (!value || value === 'null' || value === 'undefined') {
    return undefined;
  }

  return value;
}

function normalizeRegistrationResponse(result: Awaited<ReturnType<PluginLike['createPasskey']>>): RegistrationResponseJSON {
  return {
    id: result.id,
    rawId: result.rawId,
    type: 'public-key',
    authenticatorAttachment: normalizeAttachment(result.authenticatorAttachment),
    clientExtensionResults: result.clientExtensionResults ?? {},
    response: {
      attestationObject: result.response.attestationObject,
      clientDataJSON: result.response.clientDataJSON,
      authenticatorData: result.response.authenticatorData,
      transports: normalizeTransports(result.response.transports),
      publicKey: result.response.publicKey,
      publicKeyAlgorithm: result.response.publicKeyAlgorithm,
    },
  };
}

function normalizeAuthenticationResponse(
  result: Awaited<ReturnType<PluginLike['authenticate']>>,
): AuthenticationResponseJSON {
  return {
    id: result.id,
    rawId: result.rawId,
    type: 'public-key',
    authenticatorAttachment: normalizeAttachment(result.authenticatorAttachment),
    clientExtensionResults: result.clientExtensionResults ?? {},
    response: {
      clientDataJSON: result.response.clientDataJSON,
      authenticatorData: result.response.authenticatorData,
      signature: result.response.signature,
      userHandle: normalizeUserHandle(result.response.userHandle),
    },
  };
}

export function asSimpleWebAuthn(plugin: PluginLike): {
  startRegistration: (options: {
    optionsJSON: PublicKeyCredentialCreationOptionsJSON;
    useAutoRegister?: boolean;
  }) => Promise<RegistrationResponseJSON>;
  startAuthentication: (options: {
    optionsJSON: PublicKeyCredentialRequestOptionsJSON;
    useBrowserAutofill?: boolean;
    verifyBrowserAutofillInput?: boolean;
  }) => Promise<AuthenticationResponseJSON>;
} {
  return {
    startRegistration: async ({ optionsJSON }: { optionsJSON: PublicKeyCredentialCreationOptionsJSON }) => {
      try {
        const result = await plugin.createPasskey({ publicKey: optionsJSON });
        return normalizeRegistrationResponse(result);
      } catch (error) {
        throw mapPluginError(error);
      }
    },

    startAuthentication: async ({ optionsJSON }: { optionsJSON: PublicKeyCredentialRequestOptionsJSON }) => {
      try {
        const result = await plugin.authenticate({ publicKey: optionsJSON });
        return normalizeAuthenticationResponse(result);
      } catch (error) {
        throw mapPluginError(error);
      }
    },
  };
}
