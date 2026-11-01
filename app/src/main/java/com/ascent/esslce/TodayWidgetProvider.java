package com.ascent.esslce;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public class TodayWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "ascent_today_widget";
    static final String KEY_DATE = "date";
    static final String KEY_EVENTS = "events_json";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateOne(context, manager, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        for (int id : ids) updateOne(context, manager, id);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int id) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String savedDate = prefs.getString(KEY_DATE, "");
        String today = currentPlanDate();
        boolean current = today.equals(savedDate);
        JSONArray events;
        try {
            events = new JSONArray(prefs.getString(KEY_EVENTS, "[]"));
        } catch (Exception ignored) {
            events = new JSONArray();
        }
        int completed = 0;
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event != null && event.optBoolean("done", false)) completed++;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.today_widget);
        views.setTextViewText(R.id.today_widget_heading, "TODAY'S ACTIVITIES");
        views.setTextViewText(R.id.today_widget_date, current ? displayDate(savedDate) : "Open Ascent to refresh today's plan");
        views.setTextViewText(R.id.today_widget_progress,
                current ? completed + " of " + events.length() + " completed" : "Your daily list updates when Ascent opens");
        views.setTextViewText(R.id.today_widget_empty,
                current ? "No activities scheduled today" : "Open Ascent to load today's activities");

        Intent service = new Intent(context, TodayWidgetService.class);
        views.setRemoteAdapter(R.id.today_widget_list, service);
        views.setEmptyView(R.id.today_widget_list, R.id.today_widget_empty);

        Intent open = new Intent(context, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(
                context, 7410, open, FocusTimerController.pendingFlags());
        views.setPendingIntentTemplate(R.id.today_widget_list, openPending);
        views.setOnClickPendingIntent(R.id.today_widget_header, openPending);

        manager.updateAppWidget(id, views);
        manager.notifyAppWidgetViewDataChanged(id, R.id.today_widget_list);
    }

    static String currentPlanDate() {
        Calendar calendar = Calendar.getInstance();
        // Ascent's approved study day rolls over at 05:20 local time.
        calendar.add(Calendar.MINUTE, -320);
        String value = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
        if (value.compareTo("2026-10-31") < 0) return "2026-10-31";
        if (value.compareTo("2027-03-29") > 0) return "2027-03-29";
        return value;
    }

    private static String displayDate(String value) {
        try {
            Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(value);
            return new SimpleDateFormat("EEEE, d MMMM", Locale.getDefault()).format(date);
        } catch (ParseException | NullPointerException ignored) {
            return value;
        }
    }
}
