package com.ascent.esslce;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

public class TodayWidgetFactory implements RemoteViewsService.RemoteViewsFactory {
    private final Context context;
    private JSONArray events = new JSONArray();

    TodayWidgetFactory(Context context) {
        this.context = context;
    }

    @Override public void onCreate() { loadEvents(); }
    @Override public void onDataSetChanged() { loadEvents(); }
    @Override public void onDestroy() { events = new JSONArray(); }

    private void loadEvents() {
        SharedPreferences prefs = context.getSharedPreferences(TodayWidgetProvider.PREFS, Context.MODE_PRIVATE);
        String date = prefs.getString(TodayWidgetProvider.KEY_DATE, "");
        if (!TodayWidgetProvider.currentPlanDate().equals(date)) {
            events = new JSONArray();
            return;
        }
        try {
            events = new JSONArray(prefs.getString(TodayWidgetProvider.KEY_EVENTS, "[]"));
        } catch (Exception ignored) {
            events = new JSONArray();
        }
    }

    @Override public int getCount() { return events.length(); }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= events.length()) return null;
        JSONObject event = events.optJSONObject(position);
        if (event == null) return null;

        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.today_widget_row);
        row.setTextViewText(R.id.today_widget_row_time, event.optString("time", ""));
        row.setTextViewText(R.id.today_widget_row_title, event.optString("title", "Study activity"));
        boolean done = event.optBoolean("done", false);
        row.setTextViewText(R.id.today_widget_row_status, done ? "✓" : "○");
        row.setContentDescription(R.id.today_widget_row_status, done ? "Completed" : "Not completed");
        row.setOnClickFillInIntent(R.id.today_widget_row, new Intent().putExtra("today_widget_position", position));
        return row;
    }

    @Override public RemoteViews getLoadingView() { return null; }
    @Override public int getViewTypeCount() { return 1; }
    @Override public long getItemId(int position) { return position; }
    @Override public boolean hasStableIds() { return true; }
}
