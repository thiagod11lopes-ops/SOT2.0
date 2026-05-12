package br.com.sot.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeScheduledLocationPost")
public class SotNativeLocationPostPlugin extends Plugin {

    public static final String PREFS = "sot_native_location_post";
    public static final String KEY_URL = "url";
    public static final String KEY_TOKEN = "token";
    public static final String KEY_PLACA = "placa";
    public static final String KEY_DEPARTURE = "departureId";
    public static final String KEY_INTERVAL = "intervalMs";
    private static final int ALARM_REQ = 94002;
    private static final String TAG = "SOTNativeLocPost";

    private static PendingIntent alarmPendingIntent(Context ctx) {
        Intent intent = new Intent(ctx, SotLocationAlarmReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, ALARM_REQ, intent, flags);
    }

    private static void scheduleOneShot(Context appCtx, long delayMs) {
        AlarmManager am = (AlarmManager) appCtx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmPendingIntent(appCtx);
        long trigger = SystemClock.elapsedRealtime() + Math.max(250L, delayMs);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "scheduleOneShot", e);
        }
    }

    static void scheduleNextFromPrefs(Context appCtx) {
        SharedPreferences p = appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long interval = p.getLong(KEY_INTERVAL, 60_000L);
        scheduleOneShot(appCtx, interval);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        String placa = call.getString("placa");
        String departureId = call.getString("departureId");
        Integer intervalObj = call.getInt("intervalMs");
        if (url == null || token == null || placa == null || departureId == null || intervalObj == null) {
            call.reject("Missing url, token, placa, departureId or intervalMs");
            return;
        }
        long intervalMs = intervalObj.longValue();
        intervalMs = Math.max(15_000L, Math.min(intervalMs, 900_000L));

        Context app = getContext().getApplicationContext();
        SharedPreferences.Editor ed = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString(KEY_URL, url);
        ed.putString(KEY_TOKEN, token);
        ed.putString(KEY_PLACA, placa);
        ed.putString(KEY_DEPARTURE, departureId);
        ed.putLong(KEY_INTERVAL, intervalMs);
        ed.apply();

        cancelAlarm(app);
        /* Primeiro disparo rápido; os seguintes usam o intervalo em prefs. */
        scheduleOneShot(app, 750L);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context app = getContext().getApplicationContext();
        cancelAlarm(app);
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("Missing token");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
        call.resolve();
    }

    static void cancelAlarm(Context appCtx) {
        AlarmManager am = (AlarmManager) appCtx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            am.cancel(alarmPendingIntent(appCtx));
        } catch (Exception e) {
            Log.e(TAG, "cancelAlarm", e);
        }
    }
}
