package br.com.sot.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Chamada de localização: notificação full-screen + vibração (sem som).
 */
@CapacitorPlugin(name = "SotIncomingCall")
public class SotIncomingCallPlugin extends Plugin {
    /** v3: canal silencioso (só vibração). */
    public static final String CHANNEL_ID = "sot_incoming_location_call_v3";
    public static final int NOTIFICATION_ID = 71001;

    private static final long[] CALL_VIBRATE = new long[] {0, 400, 180, 400, 180, 400, 900};

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
                        .setSilent(true)
                        .setContentIntent(content)
                        .setFullScreenIntent(fullScreen, true)
                        .setVibrate(CALL_VIBRATE)
                        .setTimeoutAfter(90_000);

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            call.reject("notification_permission_denied", e);
            return;
        }

        vibrateOnce(ctx);

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

    private static void vibrateOnce(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm == null) return;
                vm.getDefaultVibrator()
                        .vibrate(VibrationEffect.createWaveform(CALL_VIBRATE, -1));
            } else {
                Vibrator vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator == null) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(CALL_VIBRATE, -1));
                } else {
                    vibrator.vibrate(CALL_VIBRATE, -1);
                }
            }
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            nm.deleteNotificationChannel("sot_incoming_location_call");
            nm.deleteNotificationChannel("sot_incoming_location_call_v2");
        } catch (Exception ignored) {
            /* ignore */
        }
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel =
                new NotificationChannel(
                        CHANNEL_ID, "Chamadas de localização HNMD", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Chamadas sem som — só vibração");
        channel.enableVibration(true);
        channel.setVibrationPattern(CALL_VIBRATE);
        channel.setSound(null, null);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        nm.createNotificationChannel(channel);
    }
}
