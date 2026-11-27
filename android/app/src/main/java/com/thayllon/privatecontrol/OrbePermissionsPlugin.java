package com.thayllon.privatecontrol;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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

    @Override
    public void load() {
        super.load();
        ensureNotificationChannel();
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
}
