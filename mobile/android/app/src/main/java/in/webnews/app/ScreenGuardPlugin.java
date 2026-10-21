package in.webnews.app;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Press meets (owner 2026-10-01): recordings replay only inside WebNEWS, so while the site asks for it (the room and
 * the recording player) the app's window is FLAG_SECURE — no screenshots, no screen recording, blank in the recents
 * list. The site calls Capacitor.Plugins.ScreenGuard.enable() / disable() (frontend lib/native-app.ts).
 */
@CapacitorPlugin(name = "ScreenGuard")
public class ScreenGuardPlugin extends Plugin {
    @PluginMethod
    public void enable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }
}
