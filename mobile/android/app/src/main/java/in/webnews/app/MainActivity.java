package in.webnews.app;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The site sits between the status bar and the navigation bar on every Android / WebView version: the app pads
 * itself by the system bars (white behind them, dark icons) and tells the page there is nothing to pad, so the
 * site's own safe-area padding (for iPhones) stays 0 here. The keyboard shrinks the page instead of covering it.
 * Capacitor's own handling is off (capacitor.config.ts → SystemBars.insetsHandling "disable").
 */
public class MainActivity extends BridgeActivity {
    /** The loading screen (owner 2026-10-05): the WebNEWS three bars filling, until the first page is on screen. */
    private View bootOverlay;
    /** Never longer than this, whatever happens. */
    private static final long BOOT_OVERLAY_MAX_MS = 20_000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // After super.onCreate: Capacitor switches from the launch theme to AppTheme.NoActionBar there. Touching the
        // window (EdgeToEdge reads the decor view) before that builds it with the launch theme — and its action bar:
        // a 56dp "WebNEWS" title bar, with the splash squashed into its background, above the site.
        // App-only plugins register before super.onCreate (Capacitor reads them there).
        registerPlugin(ScreenGuardPlugin.class);
        registerPlugin(PushSupportPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(MediaNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        watchFirstPage((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        SystemBarStyle bars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT);
        EdgeToEdge.enable(this, bars, bars);

        View root = getWindow().getDecorView();
        root.setBackgroundColor(Color.WHITE);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets system = insets.getInsets(types);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(system.left, system.top, system.right, Math.max(system.bottom, ime.bottom));
            // Zeroed rather than CONSUMED: consuming breaks later safe-area updates in the WebView
            // (https://issues.chromium.org/issues/461332423). The cutout itself goes too: the WebView turns a
            // punch-hole camera into safe-area-inset-top, which would pad the page a second time.
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(types, Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setDisplayCutout(null)
                .build();
        });
        showBootOverlay();
    }

    /**
     * The page loader's hooks: the loading screen goes once the first page is on screen (or the offline page is).
     * Debug builds only: the Mac's dev relay (`npm run phone`) serves https with a self-signed certificate on the
     * Wi-Fi address, because phones allow the camera and microphone (press meets) only on https pages. Accepted for
     * private network addresses only; release builds keep the normal certificate checks.
     */
    private void watchFirstPage(boolean debug) {
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                hideBootOverlay();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String host = Uri.parse(error.getUrl()).getHost();
                if (debug && host != null && host.matches("^(192\\.168|10)\\.\\d+\\.\\d+(\\.\\d+)?$|^172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+$")) {
                    handler.proceed();
                } else {
                    super.onReceivedSslError(view, handler, error);
                }
            }
        });
    }

    /** A white screen with the WebNEWS three bars filling in turn (res/drawable/boot_bars_animated.xml), over the app. */
    private void showBootOverlay() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.WHITE);
        overlay.setClickable(true);
        ImageView bars = new ImageView(this);
        Drawable drawable = getDrawable(R.drawable.boot_bars_animated);
        bars.setImageDrawable(drawable);
        float density = getResources().getDisplayMetrics().density;
        overlay.addView(bars, new FrameLayout.LayoutParams(Math.round(72 * density), Math.round(62 * density), Gravity.CENTER));
        content.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (drawable instanceof Animatable) ((Animatable) drawable).start();
        bootOverlay = overlay;
        new Handler(Looper.getMainLooper()).postDelayed(this::hideBootOverlay, BOOT_OVERLAY_MAX_MS);
    }

    /** Fades the loading screen out (once; later pages don't bring it back). */
    private void hideBootOverlay() {
        runOnUiThread(() -> {
            View overlay = bootOverlay;
            if (overlay == null) return;
            bootOverlay = null;
            overlay.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                if (overlay.getParent() instanceof ViewGroup) {
                    ((ViewGroup) overlay.getParent()).removeView(overlay);
                }
            }).start();
        });
    }

    /**
     * Logged in until you log out (owner 2026-10-01): the login cookie is saved to disk the moment the app leaves the
     * screen, not whenever the WebView gets round to it — swiping the app away right after logging in would otherwise
     * lose it, and the next launch would ask to log in again.
     */
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
