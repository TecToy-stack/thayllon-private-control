import { getNativeSystemInsets, isAndroidNativeApp } from './permissions';

let initialized = false;

function measureCssEnvTopPx(): number {
  if (typeof document === 'undefined' || !document.documentElement) return 0;
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:env(safe-area-inset-top, 0px);left:0;width:0;height:0;visibility:hidden;pointer-events:none;';
    document.documentElement.appendChild(probe);
    const computedTop = parseFloat(window.getComputedStyle(probe).top || '0');
    const rectTop = probe.getBoundingClientRect().top || 0;
    probe.remove();
    const val = Number.isFinite(computedTop) && computedTop > 0 ? computedTop : rectTop;
    return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
  } catch {
    return 0;
  }
}

function isStandaloneAndroidPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return isAndroid && Boolean(standalone);
}

export async function applyDynamicSafeAreaInsets(): Promise<{
  safeAreaInsetTop: number;
  statusBarHeight: number;
}> {
  if (typeof document === 'undefined' || !document.documentElement) {
    return { safeAreaInsetTop: 0, statusBarHeight: 0 };
  }

  const rootStyle = document.documentElement.style;
  const envTop = measureCssEnvTopPx();
  let extraStatusBarHeight = 0;

  if (isAndroidNativeApp()) {
    const nativeInsets = await getNativeSystemInsets();
    if (nativeInsets) {
      const uncoveredTop = Math.max(0, Number(nativeInsets.uncoveredTopInset || 0));
      // Se o Android já aplicou padding na view raiz (uncoveredTop === 0),
      // não duplicamos o espaçamento; caso contrário aplicamos a diferença exata.
      extraStatusBarHeight = Math.max(0, uncoveredTop - envTop);
    } else if (envTop === 0) {
      // Contingência conservadora para WebViews OEM que não reportam env() nem WindowInsets
      extraStatusBarHeight = 28;
    }
  } else if (isStandaloneAndroidPwa() && envTop === 0) {
    extraStatusBarHeight = 24;
  }

  rootStyle.setProperty('--safe-area-inset-top', `${envTop}px`);
  rootStyle.setProperty('--status-bar-height', `${extraStatusBarHeight}px`);
  rootStyle.setProperty('--computed-safe-top', `${Math.max(envTop, envTop + extraStatusBarHeight)}px`);

  return {
    safeAreaInsetTop: envTop,
    statusBarHeight: extraStatusBarHeight,
  };
}

export function initDynamicSafeAreaInsets(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const refresh = () => {
    void applyDynamicSafeAreaInsets();
    window.setTimeout(() => {
      void applyDynamicSafeAreaInsets();
    }, 250);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh, { once: true });
  } else {
    refresh();
  }

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  document.addEventListener('resume', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh();
    }
  });
}
