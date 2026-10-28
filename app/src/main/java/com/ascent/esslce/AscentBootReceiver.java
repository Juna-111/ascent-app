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
    }
}
