package com.ascent.esslce;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;

public final class FocusTimerController {
    static final String PREFS = "ascent_focus_timer";
    static final String CHANNEL_ID = "ascent_focus";
    static final int NOTIFICATION_ID = 7301;
    static final String ACTION_FINISH = "com.ascent.esslce.FOCUS_FINISH";
    static final String ACTION_PAUSE = "com.ascent.esslce.FOCUS_PAUSE";
    static final String ACTION_RESUME = "com.ascent.esslce.FOCUS_RESUME";
    static final String ACTION_STOP = "com.ascent.esslce.FOCUS_STOP";
    static final String ACTION_START = "com.ascent.esslce.FOCUS_START";

    private FocusTimerController() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void start(Context context, int seconds, String title) {
        int safeSeconds = Math.max(1, Math.min(seconds, 6 * 60 * 60));
        long endAt = System.currentTimeMillis() + safeSeconds * 1000L;
        String safeTitle = title == null || title.trim().isEmpty() ? "Study session" : title.trim();
        prefs(context).edit().putBoolean("running", true).putLong("endAt", endAt)
                .putLong("remaining", safeSeconds * 1000L).putString("title", safeTitle).apply();
        scheduleFinish(context, endAt);
        showRunning(context, safeTitle, endAt);
        FocusWidgetProvider.updateAll(context);
    }

    public static void pause(Context context, int seconds, String title) {
        SharedPreferences p = prefs(context);
        long currentEnd = p.getLong("endAt", 0L);
        long remaining = seconds > 0 ? seconds * 1000L : Math.max(0L, currentEnd - System.currentTimeMillis());
        if (title != null && !title.trim().isEmpty()) p.edit().putString("title", title.trim()).apply();
        p.edit().putBoolean("running", false).putLong("remaining", remaining).apply();
        cancelFinish(context);
        showPaused(context, p.getString("title", "Study session"), remaining);
        FocusWidgetProvider.updateAll(context);
    }

    public static void stop(Context context) {
        cancelFinish(context);
        prefs(context).edit().clear().apply();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        FocusWidgetProvider.updateAll(context);
    }

    static void finish(Context context) {
        SharedPreferences p = prefs(context);
        String title = p.getString("title", "Study session");
        p.edit().putBoolean("running", false).putLong("remaining", 0L).putLong("endAt", 0L).apply();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            ensureChannel(context);
            Intent open = new Intent(context, MainActivity.class);
            PendingIntent content = PendingIntent.getActivity(context, 7301, open, pendingFlags());
            Notification.Builder builder = builder(context)
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle("Focus session complete")
                    .setContentText(title + " · take a short recall break")
                    .setContentIntent(content)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setOnlyAlertOnce(false);
            manager.notify(NOTIFICATION_ID, builder.build());
        }
        FocusWidgetProvider.updateAll(context);
    }

    static void updateFromWidget(Context context) {
        SharedPreferences p = prefs(context);
        boolean running = p.getBoolean("running", false);
        if (running) {
            long remaining = p.getLong("endAt", 0L) - System.currentTimeMillis();
            if (remaining <= 0) { finish(context); return; }
            pause(context, (int) Math.max(1, remaining / 1000L), p.getString("title", "Study session"));
        } else if (p.getLong("remaining", 0L) > 0L) {
            start(context, (int) Math.max(1, p.getLong("remaining", 0L) / 1000L), p.getString("title", "Study session"));
        } else {
            start(context, 25 * 60, "Study session");
        }
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Focus timer", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Ongoing Ascent study countdown and session completion.");
                manager.createNotificationChannel(channel);
            }
        }
    }

    private static Notification.Builder builder(Context context) {
        ensureChannel(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) return new Notification.Builder(context, CHANNEL_ID);
        return new Notification.Builder(context);
    }

    private static void showRunning(Context context, String title, long endAt) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(context, 7301, open, pendingFlags());
        Intent pause = new Intent(context, FocusTimerReceiver.class).setAction(ACTION_PAUSE);
        PendingIntent pauseIntent = PendingIntent.getBroadcast(context, 7302, pause, pendingFlags());
        Notification.Builder builder = builder(context)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Ascent focus · " + title)
                .setContentText("Countdown running · tap to return to your mission")
                .setContentIntent(content)
                .setWhen(endAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Pause", pauseIntent).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(true);
        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private static void showPaused(Context context, String title, long remaining) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(context, 7301, open, pendingFlags());
        Intent resume = new Intent(context, FocusTimerReceiver.class).setAction(ACTION_RESUME);
        PendingIntent resumeIntent = PendingIntent.getBroadcast(context, 7303, resume, pendingFlags());
        Intent stop = new Intent(context, FocusTimerReceiver.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getBroadcast(context, 7304, stop, pendingFlags());
        String time = String.format(java.util.Locale.getDefault(), "%02d:%02d remaining",
                Math.max(0L, remaining) / 60000L, (Math.max(0L, remaining) / 1000L) % 60L);
        Notification.Builder builder = builder(context)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Ascent focus paused · " + title)
                .setContentText(time)
                .setContentIntent(content)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_play, "Resume", resumeIntent).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent).build());
        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private static void scheduleFinish(Context context, long endAt) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Intent intent = new Intent(context, FocusTimerReceiver.class).setAction(ACTION_FINISH);
        PendingIntent pending = PendingIntent.getBroadcast(context, 7305, intent, pendingFlags());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, pending);
        else alarm.set(AlarmManager.RTC_WAKEUP, endAt, pending);
    }

    private static void cancelFinish(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, FocusTimerReceiver.class).setAction(ACTION_FINISH);
        PendingIntent pending = PendingIntent.getBroadcast(context, 7305, intent, pendingFlags());
        if (alarm != null) alarm.cancel(pending);
        pending.cancel();
    }

    static int pendingFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}
