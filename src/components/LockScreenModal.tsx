import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, ArrowRight, Fingerprint, LogOut } from 'lucide-react';
import { AppLanguage, BiometricConfig, UserProfile } from '../types/finance';
import {
  BiometryAvailabilityInfo,
  checkNativeBiometryAvailability,
  getLocalBiometricHandle,
  verifyBiometricOnDevice,
} from '../utils/biometrics';
import { unlockCpfVault } from '../utils/vaultApi';
import { getTranslations } from '../utils/i18n';

interface LockScreenModalProps {
  isLocked: boolean;
  authToken: string;
  profile: UserProfile;
  biometric: BiometricConfig;
  language: AppLanguage;
  onUnlock: () => void;
  onLogout: () => void;
}

export const LockScreenModal: React.FC<LockScreenModalProps> = ({
  isLocked,
  authToken,
  profile,
  biometric,
  language,
  onUnlock,
  onLogout,
}) => {
  const t = getTranslations(language);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioAvailability, setBioAvailability] = useState<BiometryAvailabilityInfo | null>(null);

  useEffect(() => {
    if (!isLocked) return;
    let active = true;
    checkNativeBiometryAvailability()
      .then((info) => {
        if (active) setBioAvailability(info);
      })
      .catch(() => {
        if (active) setBioAvailability(null);
      });
    return () => {
      active = false;
    };
  }, [isLocked]);

  if (!isLocked) return null;

  const hasMatchingLocalCredential = Boolean(
    biometric.enabled &&
      getLocalBiometricHandle(profile.cpfId)?.credentialId === biometric.credentialId
  );

  const canUseBiometric = Boolean(
    hasMatchingLocalCredential && bioAvailability?.available
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin.trim())) {
      setError('Digite seu PIN de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await unlockCpfVault(authToken, { method: 'pin', pin: pin.trim() });
      setPin('');
      onUnlock();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PIN incorreto. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setLoading(true);
    setError('');
    try {
      const proof = await verifyBiometricOnDevice(profile.cpfId, biometric.credentialId);
      if (!proof) {
        throw new Error('Credencial biométrica não localizada neste dispositivo. Utilize o PIN.');
      }
      await unlockCpfVault(authToken, {
        method: 'biometric',
        credentialId: proof.credentialId,
        deviceKey: proof.deviceKey,
      });
      setPin('');
      onUnlock();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha na biometria. Utilize seu PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#111827] border border-white/[0.1] p-7 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1A2234] border border-[#C9A86A]/40 text-[#C9A86A]">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">{t.modals.lockTitle}</h2>
        <p className="mt-1 text-xs text-slate-400">
          {profile.fullName} · CPF <span className="font-mono">{profile.maskedCpf}</span>
        </p>

        {canUseBiometric && (
          <div className="mt-5 space-y-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={handleBiometricUnlock}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#1A2234] border border-[#C9A86A]/40 text-[#E5C88F] hover:bg-[#232D42] disabled:opacity-40 transition-colors"
            >
              <Fingerprint className="h-4 w-4" />
              <span>
                {loading
                  ? t.modals.waitingBio
                  : `${t.modals.unlockWithBio} ${bioAvailability?.label || 'Biometria'}`}
              </span>
            </button>
          </div>
        )}

        {hasMatchingLocalCredential && bioAvailability && !bioAvailability.available && (
          <p className="mt-4 text-[11px] text-amber-300/90 leading-relaxed">
            {bioAvailability.reason ||
              'Biometria nativa indisponível neste ambiente. Desbloqueie com seu PIN.'}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-left">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.modals.pinInputLabel}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus={!canUseBiometric}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              placeholder="••••"
              className="w-full px-4 py-2.5 rounded-lg text-center text-lg font-mono tracking-[0.4em] bg-[#090D16] border border-white/[0.12] text-white focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/60"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F] disabled:opacity-40 transition-colors"
          >
            <span>{loading ? t.modals.validating : t.modals.unlockBtn}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{t.modals.endSessionSwitchCpf}</span>
        </button>

        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>
            {bioAvailability?.native
              ? t.modals.bioNativeFooter
              : t.modals.bioServerFooter}
          </span>
        </div>
      </div>
    </div>
  );
};
