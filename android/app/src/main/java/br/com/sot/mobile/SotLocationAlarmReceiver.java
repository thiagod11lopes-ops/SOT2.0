package br.com.sot.mobile;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class SotLocationAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "SOTLocAlarm";

    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        SharedPreferences p = app.getSharedPreferences(SotNativeLocationPostPlugin.PREFS, Context.MODE_PRIVATE);
        String url = p.getString(SotNativeLocationPostPlugin.KEY_URL, null);
        String token = p.getString(SotNativeLocationPostPlugin.KEY_TOKEN, null);
        String placa = p.getString(SotNativeLocationPostPlugin.KEY_PLACA, null);
        String depId = p.getString(SotNativeLocationPostPlugin.KEY_DEPARTURE, null);
        if (url == null || token == null || placa == null || depId == null) {
            pending.finish();
            return;
        }

        boolean fine = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            Log.w(TAG, "missing location permission");
            SotNativeLocationPostPlugin.scheduleNextFromPrefs(app);
            pending.finish();
            return;
        }

        FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(app);
        CancellationTokenSource cts = new CancellationTokenSource();

        Runnable finishCycle =
                () -> {
                    SotNativeLocationPostPlugin.scheduleNextFromPrefs(app);
                    pending.finish();
                };

        fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                .addOnCompleteListener(
                        task -> {
                            Location loc = null;
                            if (task.isSuccessful()) {
                                loc = task.getResult();
                            } else {
                                Exception ex = task.getException();
                                Log.w(TAG, "getCurrentLocation: " + (ex != null ? ex.getMessage() : "?"));
                            }
                            if (loc != null) {
                                post(url, token, placa, depId, loc);
                                finishCycle.run();
                                return;
                            }
                            fused.getLastLocation()
                                    .addOnCompleteListener(
                                            t2 -> {
                                                try {
                                                    if (t2.isSuccessful()) {
                                                        Location loc2 = t2.getResult();
                                                        if (loc2 != null) {
                                                            post(url, token, placa, depId, loc2);
                                                        } else {
                                                            Log.w(TAG, "getLastLocation null");
                                                        }
                                                    }
                                                } catch (Exception e) {
                                                    Log.e(TAG, "getLastLocation", e);
                                                } finally {
                                                    finishCycle.run();
                                                }
                                            });
                        });
    }

    private static void post(String urlStr, String token, String placa, String departureId, Location loc) {
        HttpURLConnection conn = null;
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            String capturedAt = iso.format(new Date(loc.getTime()));

            JSONObject body = new JSONObject();
            body.put("placa", placa.trim());
            body.put("latitude", loc.getLatitude());
            body.put("longitude", loc.getLongitude());
            body.put("departureId", departureId);
            body.put("capturedAt", capturedAt);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(25_000);
            conn.setReadTimeout(25_000);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "HTTP " + code);
            }
        } catch (Exception e) {
            Log.e(TAG, "post", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
}
