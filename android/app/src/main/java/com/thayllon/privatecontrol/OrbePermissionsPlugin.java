package com.thayllon.privatecontrol;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "OrbePermissions",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        ),
        @Permission(
            alias = "microphone",
            strings = {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            }
        ),
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class OrbePermissionsPlugin extends Plugin {

    private static final String CHANNEL_ID = "orbe_cashflow_alerts";
    private static final String CHANNEL_NAME = "Alertas Financeiros ORBE";
    private static final String CHANNEL_DESC = "Lembretes de débitos próximos, vencimentos e recebimentos previstos.";

    private final Handler speechMainHandler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer speechRecognizer = null;
    private volatile boolean voiceKeepListening = false;
    private String voiceLang = "pt-BR";

    @Override
    public void load() {
        super.load();
        ensureNotificationChannel();
    }

    @Override
    protected void handleOnDestroy() {
        stopSpeechRecognizerInternal(false);
        super.handleOnDestroy();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Context ctx = getContext();
            if (ctx == null) return;
            NotificationManager manager = ctx.getSystemService(NotificationManager.class);
            if (manager == null) return;
            NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription(CHANNEL_DESC);
                manager.createNotificationChannel(channel);
            }
        }
    }

    private String resolveNotificationsState() {
        Context ctx = getContext();
        if (ctx == null) return "prompt";
        boolean enabledInSystem = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                ctx,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
            if (granted && enabledInSystem) return "granted";
            if (granted && !enabledInSystem) return "denied";
            PermissionState capState = getPermissionState("notifications");
            if (capState == PermissionState.DENIED) return "denied";
            Activity activity = getActivity();
            if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)) {
                return "denied";
            }
            return "prompt";
        }
        return enabledInSystem ? "granted" : "denied";
    }

    private String resolveMicrophoneState() {
        Context ctx = getContext();
        if (ctx == null) return "prompt";
        boolean granted = ContextCompat.checkSelfPermission(
            ctx,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        if (granted) return "granted";
        PermissionState capState = getPermissionState("microphone");
        if (capState == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private String resolveStorageState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+: scoped storage / document picker / app sandbox does not require legacy storage permission
            return "granted";
        }
        Context ctx = getContext();
        if (ctx == null) return "prompt";
        boolean readOk = ContextCompat.checkSelfPermission(
            ctx,
            Manifest.permission.READ_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED;
        boolean writeOk = ContextCompat.checkSelfPermission(
            ctx,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED;
        if (readOk && writeOk) return "granted";
        PermissionState capState = getPermissionState("storage");
        if (capState == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private JSObject buildStatusObject() {
        JSObject obj = new JSObject();
        obj.put("notifications", resolveNotificationsState());
        obj.put("microphone", resolveMicrophoneState());
        obj.put("storage", resolveStorageState());
        obj.put("sdkInt", Build.VERSION.SDK_INT);
        return obj;
    }

    @PluginMethod
    public void checkStatus(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void requestPermissionType(PluginCall call) {
        String type = call.getString("type", "all");
        if (type == null) type = "all";

        if ("notifications".equals(type)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if ("granted".equals(resolveNotificationsState())) {
                    call.resolve(buildStatusObject());
                    return;
                }
                requestPermissionForAlias("notifications", call, "onPermissionResult");
            } else {
                JSObject result = buildStatusObject();
                result.put("requiresSettings", !"granted".equals(resolveNotificationsState()));
                call.resolve(result);
            }
            return;
        }

        if ("microphone".equals(type)) {
            if ("granted".equals(resolveMicrophoneState())) {
                call.resolve(buildStatusObject());
                return;
            }
            requestPermissionForAlias("microphone", call, "onPermissionResult");
            return;
        }

        if ("storage".equals(type)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU || "granted".equals(resolveStorageState())) {
                call.resolve(buildStatusObject());
                return;
            }
            requestPermissionForAlias("storage", call, "onPermissionResult");
            return;
        }

        // Request all missing runtime permissions cleanly in one prompt
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !"granted".equals(resolveNotificationsState())) {
            aliases.add("notifications");
        }
        if (!"granted".equals(resolveMicrophoneState())) {
            aliases.add("microphone");
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && !"granted".equals(resolveStorageState())) {
            aliases.add("storage");
        }
        if (aliases.isEmpty()) {
            call.resolve(buildStatusObject());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "onPermissionResult");
    }

    @PermissionCallback
    private void onPermissionResult(PluginCall call) {
        JSObject result = buildStatusObject();
        boolean requiresSettings = false;
        Activity activity = getActivity();
        if (activity != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (!"granted".equals(resolveNotificationsState()) &&
                    !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)) {
                    requiresSettings = true;
                }
            }
            if (!"granted".equals(resolveMicrophoneState()) &&
                !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.RECORD_AUDIO)) {
                requiresSettings = true;
            }
        }
        result.put("requiresSettings", requiresSettings);
        call.resolve(result);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("Context unavailable");
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", ctx.getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject res = new JSObject();
            res.put("opened", true);
            call.resolve(res);
        } catch (Exception ex) {
            call.reject("Unable to open app settings", ex);
        }
    }

    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("Context unavailable");
            return;
        }
        if (!"granted".equals(resolveNotificationsState())) {
            JSObject res = new JSObject();
            res.put("shown", false);
            res.put("reason", "permission_denied");
            call.resolve(res);
            return;
        }

        ensureNotificationChannel();

        String title = call.getString("title", "ORBE Finanças");
        String body = call.getString("body", "Você possui movimentações próximas.");
        int notifId = call.getInt("id", 1001);

        Intent launchIntent = new Intent(ctx, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(ctx, notifId, launchIntent, flags);

        int iconRes = ctx.getApplicationInfo().icon;
        if (iconRes == 0) {
            iconRes = android.R.drawable.ic_dialog_info;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(title != null ? title : "ORBE Finanças")
            .setContentText(body != null ? body : "")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        try {
            NotificationManagerCompat.from(ctx).notify(notifId, builder.build());
            JSObject res = new JSObject();
            res.put("shown", true);
            call.resolve(res);
        } catch (SecurityException secEx) {
            JSObject res = new JSObject();
            res.put("shown", false);
            res.put("reason", "security_exception");
            call.resolve(res);
        }
    }

    @PluginMethod
    public void getSystemInsets(PluginCall call) {
        Context ctx = getContext();
        JSObject res = new JSObject();
        if (ctx == null) {
            res.put("statusBarHeight", 0);
            res.put("cutoutTop", 0);
            res.put("requiredTopInset", 0);
            res.put("nativePaddingTop", 0);
            res.put("uncoveredTopInset", 0);
            call.resolve(res);
            return;
        }

        float density = ctx.getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;

        int statusBarPx = 0;
        int resId = ctx.getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resId > 0) {
            statusBarPx = ctx.getResources().getDimensionPixelSize(resId);
        }

        int cutoutTopPx = 0;
        int nativePaddingTopPx = 0;
        Activity activity = getActivity();
        if (activity != null && activity.getWindow() != null) {
            View contentView = activity.findViewById(android.R.id.content);
            if (contentView != null) {
                nativePaddingTopPx = contentView.getPaddingTop();
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                View decor = activity.getWindow().getDecorView();
                WindowInsets insets = decor != null ? decor.getRootWindowInsets() : null;
                if (insets != null) {
                    DisplayCutout cutout = insets.getDisplayCutout();
                    if (cutout != null) {
                        cutoutTopPx = Math.max(cutoutTopPx, cutout.getSafeInsetTop());
                    }
                }
            }
        }

        int statusBarDp = Math.round(statusBarPx / density);
        int cutoutTopDp = Math.round(cutoutTopPx / density);
        int nativePaddingTopDp = Math.round(nativePaddingTopPx / density);
        int requiredTopDp = Math.max(statusBarDp, cutoutTopDp);
        int uncoveredTopDp = Math.max(0, requiredTopDp - nativePaddingTopDp);

        res.put("statusBarHeight", statusBarDp);
        res.put("cutoutTop", cutoutTopDp);
        res.put("requiredTopInset", requiredTopDp);
        res.put("nativePaddingTop", nativePaddingTopDp);
        res.put("uncoveredTopInset", uncoveredTopDp);
        call.resolve(res);
    }

    private static final String MIRROR_PREFS_NAME = "orbe_resilient_vault_prefs";
    private static final String MIRROR_DIR_NAME = "orbe_mirrors";

    private File getMirrorFile(Context ctx, String key) {
        String safeKey = key.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safeKey.isEmpty()) safeKey = "default_mirror";
        File dir = new File(ctx.getFilesDir(), MIRROR_DIR_NAME);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return new File(dir, safeKey + ".json");
    }

    private boolean writeMirrorFile(Context ctx, String key, String payload) {
        try {
            File target = getMirrorFile(ctx, key);
            File tmp = new File(target.getParentFile(), target.getName() + ".tmp");
            try (FileOutputStream fos = new FileOutputStream(tmp, false)) {
                fos.write(payload.getBytes(StandardCharsets.UTF_8));
                fos.getFD().sync();
            }
            if (target.exists() && !target.delete()) {
                // Fall back to direct overwrite if rename target delete fails
            }
            if (tmp.renameTo(target)) {
                return true;
            }
            try (FileOutputStream direct = new FileOutputStream(target, false)) {
                direct.write(payload.getBytes(StandardCharsets.UTF_8));
                direct.getFD().sync();
                return true;
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private String readMirrorFile(Context ctx, String key) {
        try {
            File target = getMirrorFile(ctx, key);
            if (!target.exists() || !target.isFile()) return null;
            try (FileInputStream fis = new FileInputStream(target);
                 ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = fis.read(buffer)) != -1) {
                    baos.write(buffer, 0, read);
                }
                String text = new String(baos.toByteArray(), StandardCharsets.UTF_8);
                return text.isEmpty() ? null : text;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    @PluginMethod
    public void saveNativeVaultMirror(PluginCall call) {
        Context ctx = getContext();
        String key = call.getString("key", "orbe_vault_mirror_v1");
        String payload = call.getString("payload");
        if (ctx == null || key == null || payload == null) {
            JSObject res = new JSObject();
            res.put("saved", false);
            call.resolve(res);
            return;
        }
        boolean prefsOk = false;
        boolean fileOk = writeMirrorFile(ctx, key, payload);
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(MIRROR_PREFS_NAME, Context.MODE_PRIVATE);
            prefsOk = prefs.edit().putString(key, payload).commit();
        } catch (Exception ignored) {
            prefsOk = false;
        }
        JSObject res = new JSObject();
        res.put("saved", prefsOk || fileOk);
        call.resolve(res);
    }

    @PluginMethod
    public void loadNativeVaultMirror(PluginCall call) {
        Context ctx = getContext();
        String key = call.getString("key", "orbe_vault_mirror_v1");
        JSObject res = new JSObject();
        if (ctx == null || key == null) {
            res.put("payload", null);
            call.resolve(res);
            return;
        }
        String payload = null;
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(MIRROR_PREFS_NAME, Context.MODE_PRIVATE);
            payload = prefs.getString(key, null);
        } catch (Exception ignored) {
            payload = null;
        }
        if (payload == null || payload.isEmpty()) {
            payload = readMirrorFile(ctx, key);
            if (payload != null && !payload.isEmpty()) {
                try {
                    SharedPreferences prefs = ctx.getSharedPreferences(MIRROR_PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(key, payload).apply();
                } catch (Exception ignored) {
                    // Ignore SharedPreferences heal failure when file exists
                }
            }
        }
        res.put("payload", payload);
        call.resolve(res);
    }

    @PluginMethod
    public void isNativeSpeechAvailable(PluginCall call) {
        Context ctx = getContext();
        boolean available = ctx != null && SpeechRecognizer.isRecognitionAvailable(ctx);
        JSObject res = new JSObject();
        res.put("available", available);
        call.resolve(res);
    }

    @PluginMethod
    public void startNativeSpeech(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            JSObject res = new JSObject();
            res.put("started", false);
            res.put("reason", "context_unavailable");
            call.resolve(res);
            return;
        }
        if (!"granted".equals(resolveMicrophoneState())) {
            JSObject res = new JSObject();
            res.put("started", false);
            res.put("reason", "permission_denied");
            call.resolve(res);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
            JSObject res = new JSObject();
            res.put("started", false);
            res.put("reason", "speech_unavailable");
            call.resolve(res);
            return;
        }

        String requestedLang = call.getString("lang", "pt-BR");
        voiceLang = (requestedLang != null && !requestedLang.trim().isEmpty()) ? requestedLang.trim() : "pt-BR";
        voiceKeepListening = true;

        speechMainHandler.removeCallbacksAndMessages(null);
        speechMainHandler.post(() -> startSpeechSessionOnUiThread());

        JSObject res = new JSObject();
        res.put("started", true);
        call.resolve(res);
    }

    @PluginMethod
    public void stopNativeSpeech(PluginCall call) {
        stopSpeechRecognizerInternal(true);
        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    private void scheduleSpeechRestart(long delayMs) {
        if (!voiceKeepListening) return;
        speechMainHandler.removeCallbacksAndMessages(null);
        speechMainHandler.postDelayed(() -> {
            if (voiceKeepListening) {
                startSpeechSessionOnUiThread();
            }
        }, delayMs);
    }

    private void destroySpeechRecognizerOnly() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
            } catch (Exception ignored) {
            }
            try {
                speechRecognizer.destroy();
            } catch (Exception ignored) {
            }
            speechRecognizer = null;
        }
    }

    private void stopSpeechRecognizerInternal(boolean emitState) {
        voiceKeepListening = false;
        speechMainHandler.removeCallbacksAndMessages(null);
        speechMainHandler.post(() -> {
            destroySpeechRecognizerOnly();
            if (emitState) {
                JSObject state = new JSObject();
                state.put("listening", false);
                notifyListeners("voiceState", state);
            }
        });
    }

    private void startSpeechSessionOnUiThread() {
        Context ctx = getContext();
        if (ctx == null || !voiceKeepListening) return;
        destroySpeechRecognizerOnly();

        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    if (!voiceKeepListening) return;
                    JSObject state = new JSObject();
                    state.put("listening", true);
                    notifyListeners("voiceState", state);
                }

                @Override
                public void onBeginningOfSpeech() {
                }

                @Override
                public void onRmsChanged(float rmsdB) {
                }

                @Override
                public void onBufferReceived(byte[] buffer) {
                }

                @Override
                public void onEndOfSpeech() {
                }

                @Override
                public void onError(int error) {
                    if (!voiceKeepListening) return;
                    if (error == SpeechRecognizer.ERROR_NO_MATCH
                        || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                        || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                        || error == SpeechRecognizer.ERROR_CLIENT) {
                        scheduleSpeechRestart(220L);
                        return;
                    }
                    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                        voiceKeepListening = false;
                        destroySpeechRecognizerOnly();
                        JSObject err = new JSObject();
                        err.put("code", "not-allowed");
                        err.put("message", "Permissão de microfone negada no Android.");
                        notifyListeners("voiceError", err);
                        return;
                    }
                    voiceKeepListening = false;
                    destroySpeechRecognizerOnly();
                    JSObject err = new JSObject();
                    err.put("code", "error_" + error);
                    err.put("message", "Falha na captura de voz do dispositivo (código " + error + ").");
                    notifyListeners("voiceError", err);
                }

                @Override
                public void onResults(Bundle results) {
                    if (results != null) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                            String text = matches.get(0).trim();
                            if (!text.isEmpty()) {
                                JSObject payload = new JSObject();
                                payload.put("text", text);
                                notifyListeners("voiceFinal", payload);
                            }
                        }
                    }
                    if (voiceKeepListening) {
                        scheduleSpeechRestart(160L);
                    }
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    if (!voiceKeepListening || partialResults == null) return;
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                        String text = matches.get(0).trim();
                        if (!text.isEmpty()) {
                            JSObject payload = new JSObject();
                            payload.put("text", text);
                            notifyListeners("voicePartial", payload);
                        }
                    }
                }

                @Override
                public void onEvent(int eventType, Bundle params) {
                }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, voiceLang);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 60000L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 60000L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 3000L);

            speechRecognizer.startListening(intent);
        } catch (Exception ex) {
            voiceKeepListening = false;
            destroySpeechRecognizerOnly();
            JSObject err = new JSObject();
            err.put("code", "exception");
            err.put("message", "Não foi possível iniciar o reconhecimento de voz nativo.");
            notifyListeners("voiceError", err);
        }
    }
}
