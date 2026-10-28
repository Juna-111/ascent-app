package com.ascent.esslce;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;

public class FocusWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateOne(context, manager, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName name = new ComponentName(context, FocusWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(name);
        for (int id : ids) updateOne(context, manager, id);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int id) {
        SharedPreferences p = FocusTimerController.prefs(context);
        boolean running = p.getBoolean("running", false);
        long remaining = running
                ? p.getLong("endAt", 0L) - System.currentTimeMillis()
                : p.getLong("remaining", 0L);
        if (remaining < 0L) remaining = 0L;
        if (!running && remaining == 0L) remaining = 25 * 60 * 1000L;
        String title = p.getString("title", "Your next focus session");
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.focus_widget);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_status, running ? "FOCUS IN PROGRESS" : remaining > 0 ? "PAUSED · READY WHEN YOU ARE" : "START A FOCUSED STUDY BLOCK");
        if (running && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime() + remaining, null, true);
            views.setChronometerCountDown(R.id.widget_clock, true);
        } else {
            views.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime(), null, false);
            views.setTextViewText(R.id.widget_clock, String.format(java.util.Locale.getDefault(), "%02d:%02d",
                    remaining / 60000L, (remaining / 1000L) % 60L));
        }
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(context, 7310, open, FocusTimerController.pendingFlags());
        views.setOnClickPendingIntent(R.id.widget_open, openIntent);
        views.setTextViewText(R.id.widget_pause, running ? "Pause" : remaining > 0 ? "Resume" : "Start 25m");
        views.setOnClickPendingIntent(R.id.widget_pause, action(context, running ? FocusTimerController.ACTION_PAUSE : FocusTimerController.ACTION_RESUME, 7311));
        manager.updateAppWidget(id, views);
    }

    private static PendingIntent action(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, FocusTimerReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, requestCode, intent, FocusTimerController.pendingFlags());
    }
}
