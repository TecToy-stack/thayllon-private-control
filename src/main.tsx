import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { initDynamicSafeAreaInsets } from './utils/safeArea';

initDynamicSafeAreaInsets();

if (
  typeof window !== 'undefined' &&
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  window.self === window.top
) {
  try {
    registerSW({
      immediate: true,
      onRegisterError: () => {
        // Silencia erros de registro SW em ambientes WebView restritos
      },
    });
  } catch {
    // Ignora caso WebView bloqueie Service Worker
  }
}

createRoot(document.getElementById('root')!).render(<App />);
