package com.ascent.esslce;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MissionReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        MissionReminderController.show(context);
        MissionReminderController.rescheduleNext(context);
    }
}
