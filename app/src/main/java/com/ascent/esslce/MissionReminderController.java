package com.ascent.esslce;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class MissionReminderController {
    static final String CHANNEL_ID = "ascent_reminders";
    static final int NOTIFICATION_ID = 7317;
    private static final int REQUEST_CODE = 7318;
    private MissionReminderController() {}

    public static void schedule(Context context, boolean enabled, int hour, int minute) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, MissionReminderReceiver.class);
        PendingIntent pending = PendingIntent.getBroadcast(context, REQUEST_CODE, intent, FocusTimerController.pendingFlags());
        if (manager == null) return;
        manager.cancel(pending);
        pending.cancel();
        if (!enabled) return;
        int safeHour = Math.max(0, Math.min(23, hour));
        int safeMinute = Math.max(0, Math.min(59, minute));
        java.util.Calendar next = java.util.Calendar.getInstance();
        next.set(java.util.Calendar.HOUR_OF_DAY, safeHour);
        next.set(java.util.Calendar.MINUTE, safeMinute);
        next.set(java.util.Calendar.SECOND, 0);
        next.set(java.util.Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(java.util.Calendar.DAY_OF_YEAR, 1);
        Intent nextIntent = new Intent(context, MissionReminderReceiver.class);
        PendingIntent nextPending = PendingIntent.getBroadcast(context, REQUEST_CODE, nextIntent, FocusTimerController.pendingFlags());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), nextPending);
        } else {
            manager.set(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), nextPending);
        }
        context.getSharedPreferences("ascent_mission_reminder", Context.MODE_PRIVATE).edit()
                .putBoolean("enabled", true).putInt("hour", safeHour).putInt("minute", safeMinute).apply();
    }

    static void rescheduleNext(Context context) {
        android.content.SharedPreferences p = context.getSharedPreferences("ascent_mission_reminder", Context.MODE_PRIVATE);
        if (p.getBoolean("enabled", false)) schedule(context, true, p.getInt("hour", 19), p.getInt("minute", 0));
    }

    static void show(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Daily study reminders", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("A daily reminder to open today's Ascent mission.");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(context, REQUEST_CODE, open, FocusTimerController.pendingFlags());
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Your Ascent mission is ready")
                .setContentText("Open today's plan, cover your portion, and practise with purpose.")
                .setContentIntent(content).setAutoCancel(true).setOnlyAlertOnce(true);
        manager.notify(NOTIFICATION_ID, builder.build());
    }
}
