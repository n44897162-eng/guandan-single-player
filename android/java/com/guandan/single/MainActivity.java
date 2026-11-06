package com.guandan.single;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.content.Context;

public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.BLACK);
        }

        web = new WebView(this);
        web.setBackgroundColor(0xFF0D2A1F);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setUseWideViewPort(true);        // 让 meta viewport 生效，否则会被套上一层页面缩放
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);              // 忽略系统字体放大，避免布局被撑破
        s.setDefaultTextEncodingName("utf-8");
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }

        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Store(), "AndroidStore");
        web.addJavascriptInterface(new Haptic(), "Android");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            s.setMediaPlaybackRequiresUserGesture(false);   // 报牌语音不依赖手势
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        enterFullscreen();
    }

    /** 存档兜底：写进应用私有 SharedPreferences，不依赖 WebView 的 file:// localStorage */
    public class Store {
        private SharedPreferences sp() {
            return getSharedPreferences("gd_save", MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            return sp().getString(key, null);
        }

        @JavascriptInterface
        public void set(String key, String value) {
            sp().edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void remove(String key) {
            sp().edit().remove(key).apply();
        }
    }

    /** 震动 + 报牌语音（语音由网页内的 mp3 播放，这里只负责震动） */
    public class Haptic {
        private Vibrator vb() {
            return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }

        @JavascriptInterface
        public void vibrate(final String pattern) {
            final Vibrator v = vb();
            if (v == null || !v.hasVibrator()) return;
            long[] ts;
            try {
                String[] ps = pattern.split(",");
                ts = new long[ps.length];
                for (int i = 0; i < ps.length; i++) ts[i] = Long.parseLong(ps[i].trim());
            } catch (Exception e) {
                ts = new long[]{0, 20};
            }
            if (ts.length == 1) ts = new long[]{0, ts[0]};
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(ts, -1));
                } else {
                    v.vibrate(ts, -1);
                }
            } catch (Exception e) {
            }
        }
    }

    private void enterFullscreen() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            finish();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return (window.__gdOnBack&&window.__gdOnBack())?'1':'0'}catch(e){return '0'}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (!"\"1\"".equals(v)) finish();
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
