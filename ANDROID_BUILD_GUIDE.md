# Guia de Geração do `.apk` Android — Thayllon Private Control (CF 2026+)

- **App Name:** `Thayllon Private Control`
- **Package ID:** `com.thayllon.privatecontrol`
- **Web Dir:** `dist`
- **Biometria Nativa:** `@aparajita/capacitor-biometric-auth` (`BiometricAuthNative` registrado em `MainActivity.java`)

## 1. Compilação na nuvem (GitHub Actions — Recomendado)
O workflow `.github/workflows/build-android-apk.yml` gera o arquivo `thayllon-private-control-debug.apk` automaticamente:

1. Envie o repositório para o GitHub na branch `main`.
2. (Opcional, recomendado para recuperação pós-reinstalação) Em **Settings → Secrets and variables → Actions**, cadastre `VITE_API_BASE_URL` (Variable ou Secret) com a URL HTTPS pública do servidor backend.
3. Acesse a aba **Actions → Build Android APK (Thayllon Private Control)** e execute **Run workflow** (ou faça um push em `main`).
4. Ao concluir, baixe o artefato **`thayllon-private-control-android-apk`** na seção **Artifacts**.

## 2. Pré-requisitos para compilação local
- Node.js 20+ e npm
- Java JDK 21
- Android Studio + Android SDK (API 24+)

## 3. Compilar o `.apk` de Debug localmente
```bash
# Opcional: informe a URL do servidor para sincronização automática de cofre por CPF após reinstalação
export VITE_API_BASE_URL="https://SEU-SERVIDOR-PUBLICADO.run.app"

npm install
npm run android:debug-apk
```
Arquivo gerado:
`android/app/build/outputs/apk/debug/app-debug.apk`

## 4. Compilar o `.apk` de Release (produção assinada)
1. Gere sua keystore (apenas uma vez):
   ```bash
   keytool -genkey -v -keystore thayllon-release.keystore -alias thayllon-key -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configure `signingConfigs` em `android/app/build.gradle` ou use o **Android Studio**:
   ```bash
   npm run build:android
   npm run android:open
   ```
   No Android Studio: **Build > Generate Signed Bundle / APK... > APK**.
   Ou via linha de comando:
   ```bash
   npm run android:release-apk
   ```
