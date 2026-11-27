import { Capacitor, registerPlugin } from '@capacitor/core';
import { checkNativeBiometryAvailability } from './biometrics';

export type AppPermissionStatus = 'granted' | 'prompt' | 'denied' | 'unsupported';
export type AppPermissionKind = 'notifications' | 'microphone' | 'storage';

export interface PermissionsSnapshot {
  platform: 'android' | 'web';
  notifications: AppPermissionStatus;
  microphone: AppPermissionStatus;
  storage: AppPermissionStatus;
  biometrics: AppPermissionStatus;
  biometricsLabel: string;
  networkOnline: boolean;
  requiresSettings: boolean;
}

interface OrbePermissionsNativeResult {
  notifications?: string;
  microphone?: string;
  storage?: string;
  sdkInt?: number;
  requiresSettings?: boolean;
}

interface OrbePermissionsPlugin {
  checkStatus(): Promise<OrbePermissionsNativeResult>;
  requestPermissionType(options: {
    type: 'notifications' | 'microphone' | 'storage' | 'all';
  }): Promise<OrbePermissionsNativeResult>;
  openAppSettings(): Promise<{ opened: boolean }>;
  showLocalNotification(options: {
    title: string;
    body: string;
    id?: number;
  }): Promise<{ shown: boolean; reason?: string }>;
}

const OrbePermissionsNative = registerPlugin<OrbePermissionsPlugin>('OrbePermissions');

const NOTIFIED_STORAGE_KEY = 'orbe_notified_alerts_v1';

function normalizeStatus(raw?: string): AppPermissionStatus {
  if (raw === 'granted' || raw === 'prompt' || raw === 'denied' || raw === 'unsupported') {
    return raw;
  }
  return 'prompt';
}

export function isAndroidNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

async function getWebNotificationStatus(): Promise<AppPermissionStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

async function getWebMicrophoneStatus(): Promise<AppPermissionStatus> {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const res = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (res.state === 'granted') return 'granted';
      if (res.state === 'denied') return 'denied';
      return 'prompt';
    } catch {
      // Safari / WebView fallback
    }
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    return 'prompt';
  }
  return 'unsupported';
}

export async function getPermissionsSnapshot(): Promise<PermissionsSnapshot> {
  const networkOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  let biometrics: AppPermissionStatus = 'unsupported';
  let biometricsLabel = 'Biometria não disponível';

  try {
    const bioInfo = await checkNativeBiometryAvailability();
    biometricsLabel = bioInfo.label || 'Biometria do Dispositivo';
    biometrics = bioInfo.available ? 'granted' : 'unsupported';
  } catch {
    biometrics = 'unsupported';
  }

  if (isAndroidNativeApp()) {
    try {
      const native = await OrbePermissionsNative.checkStatus();
      const notifications = normalizeStatus(native.notifications);
      const microphone = normalizeStatus(native.microphone);
      const storage = normalizeStatus(native.storage);
      return {
        platform: 'android',
        notifications,
        microphone,
        storage,
        biometrics,
        biometricsLabel,
        networkOnline,
        requiresSettings:
          notifications === 'denied' || microphone === 'denied' || storage === 'denied',
      };
    } catch {
      // Fall through to web checks
    }
  }

  const [notifications, microphone] = await Promise.all([
    getWebNotificationStatus(),
    getWebMicrophoneStatus(),
  ]);

  return {
    platform: 'web',
    notifications,
    microphone,
    storage: 'granted',
    biometrics,
    biometricsLabel,
    networkOnline,
    requiresSettings: notifications === 'denied' || microphone === 'denied',
  };
}

export async function requestAppPermission(
  type: AppPermissionKind | 'all'
): Promise<PermissionsSnapshot> {
  if (isAndroidNativeApp()) {
    try {
      const native = await OrbePermissionsNative.requestPermissionType({ type });
      const snapshot = await getPermissionsSnapshot();
      return {
        ...snapshot,
        notifications: native.notifications
          ? normalizeStatus(native.notifications)
          : snapshot.notifications,
        microphone: native.microphone
          ? normalizeStatus(native.microphone)
          : snapshot.microphone,
        storage: native.storage ? normalizeStatus(native.storage) : snapshot.storage,
        requiresSettings: Boolean(native.requiresSettings) || snapshot.requiresSettings,
      };
    } catch {
      return getPermissionsSnapshot();
    }
  }

  if ((type === 'notifications' || type === 'all') && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch {
      // Ignore notification rejection
    }
  }

  if (
    (type === 'microphone' || type === 'all') &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  ) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // User denied or no hardware mic
    }
  }

  return getPermissionsSnapshot();
}

export async function openNativeAppSettings(): Promise<boolean> {
  if (!isAndroidNativeApp()) {
    return false;
  }
  try {
    const res = await OrbePermissionsNative.openAppSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

function hashTagToId(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0x7fffffff;
  }
  return 1000 + (hash % 50000);
}

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function wasNotifiedToday(tagKey: string): boolean {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[tagKey] === getTodayDateKey();
  } catch {
    return false;
  }
}

function markNotifiedToday(tagKey: string): void {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    const parsed: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const today = getTodayDateKey();
    const cleaned: Record<string, string> = {};
    Object.entries(parsed).forEach(([k, v]) => {
      if (v === today) cleaned[k] = v;
    });
    cleaned[tagKey] = today;
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    // Ignore storage limit errors
  }
}

export async function sendCashflowAlertNotification(
  title: string,
  body: string,
  tagKey: string
): Promise<boolean> {
  if (wasNotifiedToday(tagKey)) {
    return false;
  }

  if (isAndroidNativeApp()) {
    try {
      const res = await OrbePermissionsNative.showLocalNotification({
        title,
        body,
        id: hashTagToId(tagKey),
      });
      if (res?.shown) {
        markNotifiedToday(tagKey);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/orbe-logo.png',
        tag: tagKey,
      });
      markNotifiedToday(tagKey);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
