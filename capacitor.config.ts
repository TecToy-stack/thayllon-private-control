import type { CapacitorConfig } from '@capacitor/cli';

// Configuração base do Capacitor para empacotamento Android (.apk)
const config: CapacitorConfig = {
  appId: 'com.thayllon.privatecontrol',
  appName: 'Thayllon Private Control',
  webDir: 'dist',
  android: {
    backgroundColor: '#090D16',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#090D16',
      showSpinner: false,
    },
  },
};

export default config;
