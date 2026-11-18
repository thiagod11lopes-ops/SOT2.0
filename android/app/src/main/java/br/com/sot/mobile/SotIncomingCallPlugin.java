package br.com.sot.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Chamada de localização: notificação full-screen + toque padrão de ligações do celular.
 */
@CapacitorPlugin(name = "SotIncomingCall")
public class SotIncomingCallPlugin extends Plugin {
    /** v2: canal com som = toque de telefone (canais antigos no Android não atualizam o som). */
    public static final String CHANNEL_ID = "sot_incoming_location_call_v2";
    public static final int NOTIFICATION_ID = 71001;

    private Ringtone activeRingtone;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable ringtoneLoopRunnable;

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

        Uri ringUri = defaultRingtoneUri(ctx);
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
        if (ringUri != null) {
            builder.setSound(ringUri);
        }

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            call.reject("notification_permission_denied", e);
            return;
        }

        startSystemRingtone(ctx);

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
        stopSystemRingtone();
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    /** Toca o toque padrão de ligações (o mesmo das chamadas do telefone). */
    @PluginMethod
    public void startRingtone(PluginCall call) {
        startSystemRingtone(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        stopSystemRingtone();
        call.resolve();
    }

    private static Uri defaultRingtoneUri(Context ctx) {
        Uri uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE);
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        }
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }
        return uri;
    }

    private synchronized void startSystemRingtone(Context ctx) {
        stopSystemRingtone();
        Uri uri = defaultRingtoneUri(ctx);
        if (uri == null) return;
        try {
            Ringtone ring = RingtoneManager.getRingtone(ctx.getApplicationContext(), uri);
            if (ring == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ring.setLooping(true);
                ring.setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ring.setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
            }
            activeRingtone = ring;
            ring.play();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                ringtoneLoopRunnable =
                        new Runnable() {
                            @Override
                            public void run() {
                                Ringtone current = activeRingtone;
                                if (current == null) return;
                                try {
                                    if (!current.isPlaying()) {
                                        current.play();
                                    }
                                } catch (Exception ignored) {
                                    return;
                                }
                                mainHandler.postDelayed(this, 2500);
                            }
                        };
                mainHandler.postDelayed(ringtoneLoopRunnable, 2500);
            }
        } catch (Exception ignored) {
            activeRingtone = null;
        }
    }

    private synchronized void stopSystemRingtone() {
        if (ringtoneLoopRunnable != null) {
            mainHandler.removeCallbacks(ringtoneLoopRunnable);
            ringtoneLoopRunnable = null;
        }
        Ringtone ring = activeRingtone;
        activeRingtone = null;
        if (ring == null) return;
        try {
            if (ring.isPlaying()) ring.stop();
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        // Remove canal antigo sem toque de telefone.
        try {
            nm.deleteNotificationChannel("sot_incoming_location_call");
        } catch (Exception ignored) {
            /* ignore */
        }
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel =
                new NotificationChannel(
                        CHANNEL_ID, "Chamadas de localização HNMD", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Usa o toque padrão de ligações do celular");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        Uri ringUri = defaultRingtoneUri(ctx);
        if (ringUri != null) {
            AudioAttributes attrs =
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();
            channel.setSound(ringUri, attrs);
        }
        nm.createNotificationChannel(channel);
    }
}
