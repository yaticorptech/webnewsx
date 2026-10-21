package in.webnews.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Push notifications (owner 2026-10-02): whether this build has Firebase set up — google-services.json in
 * android/app/ when it was built (the google-services Gradle plugin then adds the `google_app_id` string). Without it
 * PushNotifications.register() would crash the app, so the site checks here first (frontend lib/native-app.ts).
 */
@CapacitorPlugin(name = "PushSupport")
public class PushSupportPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("configured", id != 0);
        call.resolve(result);
    }
}
