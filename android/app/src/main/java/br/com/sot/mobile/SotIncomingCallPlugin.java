package br.com.sot.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mostra uma notificação de «chamada» com full-screen intent na tela de bloqueio (Android nativo).
 * Só funciona no APK Capacitor — PWA no Chrome continua limitada à notificação web.
 */
@CapacitorPlugin(name = "SotIncomingCall")
public class SotIncomingCallPlugin extends Plugin {
    public static final String CHANNEL_ID = "sot_incoming_location_call";
    public static final int NOTIFICATION_ID = 71001;

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title", "Chamada do HNMD");
        String body = call.getString("body", "Enviar localização para HNMD");
        Context ctx = getContext();
        ensureChannel(ctx);

        Intent full = new Intent(ctx, MainActivity.class);
        full.setAction(Intent.ACTION_MAIN);
        full.addCategory(Intent.CATEGORY_LAUNCHER);
        full.putExtra("sotIncomingCall", true);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, 42, full, flags);
        PendingIntent content = PendingIntent.getActivity(ctx, 43, full, flags);

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(ctx, CHANNEL_ID)
                        .setSmallIcon(ctx.getApplicationInfo().icon)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_CALL)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setOngoing(true)
                        .setAutoCancel(false)
                        .setContentIntent(content)
                        .setFullScreenIntent(fullScreen, true)
                        .setTimeoutAfter(90_000);

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            call.reject("notification_permission_denied", e);
            return;
        }

        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock wl =
                        pm.newWakeLock(
                                PowerManager.FULL_WAKE_LOCK
                                        | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                        | PowerManager.ON_AFTER_RELEASE,
                                "sot:incomingCall");
                wl.acquire(4000);
            }
        } catch (Exception ignored) {
            /* ignore */
        }

        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel =
                new NotificationChannel(
                        CHANNEL_ID, "Chamadas de localização HNMD", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Chamadas para enviar a localização com o celular bloqueado");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        nm.createNotificationChannel(channel);
    }
}
