package com.ascent.esslce;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FocusTimerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (FocusTimerController.ACTION_FINISH.equals(action)) {
            FocusTimerController.finish(context);
        } else if (FocusTimerController.ACTION_PAUSE.equals(action)) {
            FocusTimerController.pause(context, 0, null);
        } else if (FocusTimerController.ACTION_RESUME.equals(action)) {
            long remaining = FocusTimerController.prefs(context).getLong("remaining", 25 * 60 * 1000L);
            String title = FocusTimerController.prefs(context).getString("title", "Study session");
            FocusTimerController.start(context, (int) Math.max(1, remaining / 1000L), title);
        } else if (FocusTimerController.ACTION_STOP.equals(action)) {
            FocusTimerController.stop(context);
        } else if (FocusTimerController.ACTION_START.equals(action)) {
            FocusTimerController.start(context, 25 * 60, "Study session");
        }
    }
}
