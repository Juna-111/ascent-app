package com.ascent.esslce;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
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
            MainActivity.this.openExternal(url);
        }
    }
}
