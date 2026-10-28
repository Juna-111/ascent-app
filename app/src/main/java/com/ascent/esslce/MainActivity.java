package com.ascent.esslce;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

/**
 * Hosts the Ascent ESSLCE web app entirely from bundled assets.
 * No network permission is requested, so everything runs offline.
 */
public class MainActivity extends Activity {

    private static final String START_PAGE = "file:///android_asset/www/index.html";

    /*
     * Runs after every page load. Two jobs:
     *  1. Local links (e.g. "Open the 7-month plan", which uses target="_blank")
     *     navigate inside the app instead of trying to open a new window.
     *  2. External http(s) links are handed to the phone's browser.
     * Capture-phase listener so it also covers links created later by app.js.
     */
    private static final String CLICK_FIX_JS =
            "(function(){"
            + "if (window.__ascentClickFix) return; window.__ascentClickFix = true;"
            + "document.addEventListener('click', function(e){"
            + "  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;"
            + "  if (!a) return;"
            + "  var href = a.getAttribute('href') || '';"
            + "  if (/^https?:/i.test(href)) {"
            + "    e.preventDefault();"
            + "    if (window.AndroidBridge) window.AndroidBridge.openExternal(a.href);"
            + "    return;"
            + "  }"
            + "  if (a.hasAttribute('target')) a.removeAttribute('target');"
            + "}, true);"
            + "})();";

    private WebView webView;
    private int pendingFocusSeconds = 0;
    private String pendingFocusTitle = "Study session";
    private boolean pendingReminderEnabled = false;
    private int pendingReminderHour = 19;
    private int pendingReminderMinute = 0;

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FocusTimerController.ensureChannel(this);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);          // the app is JavaScript
        s.setDomStorageEnabled(true);          // required for localStorage (progress saving)
        s.setAllowFileAccess(true);            // load bundled files from assets
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        // WebView does not reliably show JavaScript prompt/alert dialogs without a WebChromeClient.
        // The Daily Vocabulary self-test uses prompt() so it must work in the Android app too.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Ascent")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { result.confirm(); }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override public void onCancel(DialogInterface dialog) { result.cancel(); }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Ascent")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { result.confirm(); }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { result.cancel(); }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override public void onCancel(DialogInterface dialog) { result.cancel(); }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
                final EditText input = new EditText(MainActivity.this);
                input.setSingleLine(true);
                input.setText(defaultValue == null ? "" : defaultValue);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Vocabulary recall")
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { result.confirm(input.getText().toString()); }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { result.cancel(); }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override public void onCancel(DialogInterface dialog) { result.cancel(); }
                        })
                        .show();
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    openExternal(uri.toString());
                    return true;
                }
                return false; // bundled file:// pages load inside the app
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(CLICK_FIX_JS, null);
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_PAGE);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            if (requestCode == 7306 && pendingFocusSeconds > 0) {
                FocusTimerController.start(this, pendingFocusSeconds, pendingFocusTitle);
                pendingFocusSeconds = 0;
            } else if (requestCode == 7307 && pendingReminderEnabled) {
                MissionReminderController.schedule(this, true, pendingReminderHour, pendingReminderMinute);
                pendingReminderEnabled = false;
            }
        }
    }

    @Override
    public void onBackPressed() {
        // Back goes to the previous page in the app (e.g. from the plan back to the tracker).
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }

    private void openExternal(final String url) {
        if (url == null) return;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No browser installed; nothing sensible to do offline.
                }
            }
        });
    }

    /** JavaScript bridge: lets the page ask Android to open an external link. */
    public class AndroidBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null) return;
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return;
            MainActivity.this.openExternal(uri.toString());
        }

        @JavascriptInterface
        public String getFocusTimerStatus() {
            android.content.SharedPreferences prefs = FocusTimerController.prefs(MainActivity.this);
            if (prefs.getBoolean("running", false)) return "running";
            if (prefs.getLong("remaining", 0L) > 0L) return "paused";
            return "none";
        }

        @JavascriptInterface
        public void startFocusTimer(final int seconds, final String title) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        android.content.SharedPreferences appPrefs = getSharedPreferences("ascent_app", MODE_PRIVATE);
                        if (!appPrefs.getBoolean("asked_notif_permission", false)) {
                            appPrefs.edit().putBoolean("asked_notif_permission", true).apply();
                            pendingFocusSeconds = Math.max(1, seconds);
                            pendingFocusTitle = title == null ? "Study session" : title;
                            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7306);
                            return;
                        }
                    }
                    FocusTimerController.start(MainActivity.this, seconds, title);
                }
            });
        }

        @JavascriptInterface
        public void pauseFocusTimer(final int remainingSeconds, final String title) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    FocusTimerController.pause(MainActivity.this, remainingSeconds, title);
                }
            });
        }

        @JavascriptInterface
        public void scheduleDailyReminder(final boolean enabled, final int hour, final int minute) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (!enabled) {
                        MissionReminderController.schedule(MainActivity.this, false, hour, minute);
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        android.content.SharedPreferences appPrefs = getSharedPreferences("ascent_app", MODE_PRIVATE);
                        if (!appPrefs.getBoolean("asked_notif_permission", false)) {
                            appPrefs.edit().putBoolean("asked_notif_permission", true).apply();
                            pendingReminderEnabled = true;
                            pendingReminderHour = hour;
                            pendingReminderMinute = minute;
                            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7307);
                            return;
                        }
                    }
                    MissionReminderController.schedule(MainActivity.this, true, hour, minute);
                }
            });
        }

        @JavascriptInterface
        public void completeFocusTimer() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    FocusTimerController.finish(MainActivity.this);
                }
            });
        }

        @JavascriptInterface
        public void stopFocusTimer() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    FocusTimerController.stop(MainActivity.this);
                }
            });
        }
    }
}
