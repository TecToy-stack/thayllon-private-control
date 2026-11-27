import { Capacitor } from '@capacitor/core';
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
} from '@aparajita/capacitor-biometric-auth';
import {
  loadLocalMetaRecord,
  safeLocalStorageGet,
  safeLocalStorageSet,
  saveLocalMetaRecord,
} from './localVault';

export type BiometricMode = 'capacitor_native' | 'webauthn' | 'device_key';

export interface BiometricEnrollmentResult {
  credentialId: string;
  deviceKey: string;
  deviceLabel: string;
  mode: BiometricMode;
}

export interface BiometryAvailabilityInfo {
  available: boolean;
  native: boolean;
  deviceIsSecure: boolean;
  biometryType: BiometryType;
  label: string;
  reason?: string;
}

const BIO_LOCAL_PREFIX = 'tpc_bio_cred_';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomToken(len = 32): string {
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return toBase64Url(arr);
}

export function isNativeCapacitorRuntime(): boolean {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials?.create)
  );
}

export function getDeviceLabel(): string {
  if (isNativeCapacitorRuntime()) {
    const plat = Capacitor.getPlatform();
    if (plat === 'android') return 'Android Biometria Nativa';
    if (plat === 'ios') return 'iOS Face ID / Touch ID Nativo';
  }
  if (typeof navigator === 'undefined') return 'Dispositivo Padrão';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iOS/i.test(ua)) return 'Apple Face ID / Touch ID';
  if (/Android/i.test(ua)) return 'Android Biometria';
  if (/Mac/i.test(ua)) return 'macOS Touch ID';
  if (/Windows/i.test(ua)) return 'Windows Hello';
  return 'Navegador · WebAuthn';
}

function describeBiometryType(type: BiometryType): string {
  switch (type) {
    case BiometryType.fingerprintAuthentication:
      return 'Impressão Digital (Android)';
    case BiometryType.faceAuthentication:
      return 'Reconhecimento Facial (Android)';
    case BiometryType.irisAuthentication:
      return 'Reconhecimento por Íris (Android)';
    case BiometryType.faceId:
      return 'Face ID';
    case BiometryType.touchId:
      return 'Touch ID';
    default:
      return getDeviceLabel();
  }
}

function mapBiometryErrorMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof BiometryError || (typeof err === 'object' && err !== null && 'code' in err)) {
    const code = (err as { code?: BiometryErrorType | string }).code;
    switch (code) {
      case BiometryErrorType.userCancel:
      case BiometryErrorType.appCancel:
      case BiometryErrorType.systemCancel:
        return 'Autenticação biométrica cancelada. Utilize seu PIN ou tente novamente.';
      case BiometryErrorType.userFallback:
        return 'Alternado para validação por PIN.';
      case BiometryErrorType.authenticationFailed:
        return 'Biometria não reconhecida. Tente novamente ou utilize seu PIN.';
      case BiometryErrorType.biometryLockout:
        return 'Biometria temporariamente bloqueada por excesso de tentativas. Utilize seu PIN.';
      case BiometryErrorType.biometryNotEnrolled:
        return 'Nenhuma biometria cadastrada nas configurações deste aparelho. Utilize seu PIN.';
      case BiometryErrorType.biometryNotAvailable:
        return 'Sensor biométrico indisponível neste dispositivo. Utilize seu PIN.';
      case BiometryErrorType.passcodeNotSet:
      case BiometryErrorType.noDeviceCredential:
        return 'O aparelho não possui bloqueio de tela/PIN configurado. Utilize o PIN do cofre.';
      default:
        break;
    }
  }
  return err instanceof Error && err.message ? err.message : fallbackMessage;
}

export async function checkNativeBiometryAvailability(): Promise<BiometryAvailabilityInfo> {
  if (isNativeCapacitorRuntime()) {
    try {
      const info = await BiometricAuth.checkBiometry();
      const canAuth = Boolean(info.isAvailable || info.deviceIsSecure);
      return {
        available: canAuth,
        native: true,
        deviceIsSecure: Boolean(info.deviceIsSecure),
        biometryType: info.biometryType,
        label: info.isAvailable
          ? describeBiometryType(info.biometryType)
          : info.deviceIsSecure
          ? 'Credencial Segura do Dispositivo'
          : 'Biometria indisponível',
        reason: info.reason || undefined,
      };
    } catch (err: unknown) {
      return {
        available: false,
        native: true,
        deviceIsSecure: false,
        biometryType: BiometryType.none,
        label: 'Biometria Nativa Indisponível',
        reason: err instanceof Error ? err.message : 'Falha ao consultar hardware biométrico.',
      };
    }
  }

  const webAuthn = isWebAuthnSupported();
  return {
    available: webAuthn,
    native: false,
    deviceIsSecure: webAuthn,
    biometryType: BiometryType.none,
    label: webAuthn ? getDeviceLabel() : 'WebAuthn indisponível neste navegador',
    reason: webAuthn ? undefined : 'Use seu PIN ou instale o app Android para biometria nativa.',
  };
}

export function saveLocalBiometricHandle(cpfId: string, credentialId: string, deviceKey: string): void {
  const payload = { credentialId, deviceKey };
  safeLocalStorageSet(`${BIO_LOCAL_PREFIX}${cpfId}`, JSON.stringify(payload), {
    allowEvict: true,
  });
  void saveLocalMetaRecord(`${BIO_LOCAL_PREFIX}${cpfId}`, payload);
}

export function getLocalBiometricHandle(
  cpfId: string
): { credentialId: string; deviceKey: string } | null {
  try {
    const raw = safeLocalStorageGet(`${BIO_LOCAL_PREFIX}${cpfId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { credentialId?: string; deviceKey?: string };
    if (parsed?.credentialId && parsed?.deviceKey) {
      return { credentialId: parsed.credentialId, deviceKey: parsed.deviceKey };
    }
    return null;
  } catch {
    return null;
  }
}

export async function rehydrateLocalBiometricHandleFromIdb(
  cpfId: string
): Promise<{ credentialId: string; deviceKey: string } | null> {
  const existing = getLocalBiometricHandle(cpfId);
  if (existing) {
    void saveLocalMetaRecord(`${BIO_LOCAL_PREFIX}${cpfId}`, existing);
    return existing;
  }
  const idbHandle = await loadLocalMetaRecord<{ credentialId?: string; deviceKey?: string }>(
    `${BIO_LOCAL_PREFIX}${cpfId}`
  );
  if (idbHandle?.credentialId && idbHandle?.deviceKey) {
    safeLocalStorageSet(
      `${BIO_LOCAL_PREFIX}${cpfId}`,
      JSON.stringify({ credentialId: idbHandle.credentialId, deviceKey: idbHandle.deviceKey }),
      { allowEvict: true }
    );
    return { credentialId: idbHandle.credentialId, deviceKey: idbHandle.deviceKey };
  }
  return null;
}

async function promptNativeBiometric(subtitle: string): Promise<void> {
  try {
    await BiometricAuth.authenticate({
      reason: subtitle,
      cancelTitle: 'Usar PIN',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Usar PIN',
      androidTitle: 'ORBE Finanças',
      androidSubtitle: subtitle,
      androidConfirmationRequired: false,
      androidBiometryStrength: AndroidBiometryStrength.weak,
    });
  } catch (err: unknown) {
    throw new Error(mapBiometryErrorMessage(err, 'Falha na validação biométrica nativa.'));
  }
}

export async function enrollBiometricForCpf(
  cpfId: string,
  fullName: string
): Promise<BiometricEnrollmentResult> {
  const deviceKey = generateRandomToken(32);

  if (isNativeCapacitorRuntime()) {
    const info = await checkNativeBiometryAvailability();
    if (!info.available) {
      throw new Error(
        info.reason ||
          'Cadastre sua digital/rosto ou bloqueio de tela nas configurações do Android antes de vincular a biometria.'
      );
    }

    await promptNativeBiometric('Confirme sua biometria para proteger este cofre');
    const credentialId = `natbio_${generateRandomToken(16)}`;
    saveLocalBiometricHandle(cpfId, credentialId, deviceKey);
    return {
      credentialId,
      deviceKey,
      deviceLabel: info.label,
      mode: 'capacitor_native',
    };
  }

  const deviceLabel = getDeviceLabel();
  if (isWebAuthnSupported()) {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode(cpfId.slice(0, 32));

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'ORBE Finanças' },
          user: {
            id: userId,
            name: `cpf-${cpfId.slice(0, 8)}`,
            displayName: fullName || 'Titular ORBE Finanças',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            userVerification: 'preferred',
            residentKey: 'preferred',
          },
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;

      if (cred?.rawId) {
        const credentialId = toBase64Url(new Uint8Array(cred.rawId));
        saveLocalBiometricHandle(cpfId, credentialId, deviceKey);
        return {
          credentialId,
          deviceKey,
          deviceLabel,
          mode: 'webauthn',
        };
      }
    } catch {
      throw new Error(
        'Não foi possível ativar WebAuthn neste navegador/visualização. Utilize o PIN no navegador ou a biometria nativa no app Android.'
      );
    }
  }

  throw new Error(
    'Biometria hardware não suportada neste ambiente web. Utilize seu PIN ou o aplicativo Android.'
  );
}

export async function verifyBiometricOnDevice(
  cpfId: string,
  expectedCredentialId?: string
): Promise<{ credentialId: string; deviceKey: string; mode: BiometricMode } | null> {
  const local = getLocalBiometricHandle(cpfId);
  if (!local) return null;

  if (expectedCredentialId && local.credentialId !== expectedCredentialId) {
    return null;
  }

  if (isNativeCapacitorRuntime()) {
    await promptNativeBiometric('Autentique com sua biometria para desbloquear');
    return {
      credentialId: local.credentialId,
      deviceKey: local.deviceKey,
      mode: 'capacitor_native',
    };
  }

  if (isWebAuthnSupported() && !local.credentialId.startsWith('devbio_') && !local.credentialId.startsWith('natbio_')) {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: 'preferred',
          timeout: 30000,
        },
      });
      if (assertion) {
        return {
          credentialId: local.credentialId,
          deviceKey: local.deviceKey,
          mode: 'webauthn',
        };
      }
    } catch {
      throw new Error('Autenticação biométrica WebAuthn cancelada ou bloqueada. Utilize seu PIN.');
    }
  }

  throw new Error(
    'Biometria nativa disponível apenas no app Android ou navegador com WebAuthn ativo. Utilize seu PIN.'
  );
}
