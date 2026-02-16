import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function patchFile(path, transform, message) {
  if (!existsSync(path)) {
    return;
  }

  const original = readFileSync(path, 'utf8');
  const next = transform(original);

  if (next !== original) {
    writeFileSync(path, next, 'utf8');
    console.log(message);
  }
}

const spmPath = resolve('ios/App/CapApp-SPM/Package.swift');
patchFile(
  spmPath,
  (content) =>
    content.replace(
      '.product(name: "CapacitorPasskeyPlugin", package: "CapacitorPasskeyPlugin")',
      '.product(name: "PasskeyPlugin", package: "CapacitorPasskeyPlugin")',
    ),
  'Patched iOS SPM plugin product name for capacitor-passkey-plugin.',
);

const passkeySwiftPath = resolve('node_modules/capacitor-passkey-plugin/ios/Sources/PasskeyPlugin/PasskeyPlugin.swift');
patchFile(
  passkeySwiftPath,
  (content) =>
    content
      .replace(
        "            case .preferSignInWithApple:\n                return PasskeyPluginErrorCode.unsupported.rawValue\n",
        '',
      )
      .replace(
        "            case .deviceNotConfiguredForPasskeyCreation:\n                return PasskeyPluginErrorCode.unsupported.rawValue\n",
        '',
      ),
  'Patched capacitor-passkey-plugin iOS enum cases for Xcode compatibility.',
);

const passkeyPackageSwiftPath = resolve('node_modules/capacitor-passkey-plugin/Package.swift');
patchFile(
  passkeyPackageSwiftPath,
  (content) => content.replace(
    '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")',
    '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")',
  ),
  'Patched capacitor-passkey-plugin SPM dependency to capacitor-swift-pm 8.x.',
);
