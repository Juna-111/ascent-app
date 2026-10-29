package com.ascent.esslce;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores the user's opted-in daily mission reminder after Android restarts. */
public class AscentBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        MissionReminderController.rescheduleNext(context);

        android.content.SharedPreferences focusPrefs = FocusTimerController.prefs(context);
        if (focusPrefs.getBoolean("running", false)) {
            long endAt = focusPrefs.getLong("endAt", 0L);
            if (endAt > System.currentTimeMillis()) {
                FocusTimerController.restoreAfterBoot(context, endAt);
            } else {
                FocusTimerController.finish(context);
            }
        }
    }
}
