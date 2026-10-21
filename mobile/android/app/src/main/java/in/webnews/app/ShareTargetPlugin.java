package in.webnews.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Sharing a story straight to one app (owner 2026-10-02): the share sheet's WhatsApp / Telegram / X / Facebook /
 * LinkedIn buttons open that app with the story's cover image attached and "headline + link" as the caption — a web
 * link (wa.me, …) can't carry a picture. The site saves the image to the app's cache first (Filesystem) and passes its
 * file URI. Rejects with "not_installed" when the app isn't on the phone (the site then opens the web link instead).
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String target = call.getString("package");
        String text = call.getString("text");
        String file = call.getString("file");
        Intent intent = new Intent(Intent.ACTION_SEND);
        if (target != null) intent.setPackage(target);
        if (text != null) intent.putExtra(Intent.EXTRA_TEXT, text);
        if (file != null) {
            try {
                Uri uri = FileProvider.getUriForFile(
                    getActivity(),
                    getContext().getPackageName() + ".fileprovider",
                    new File(Uri.parse(file).getPath())
                );
                intent.setType("image/jpeg");
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.setClipData(ClipData.newRawUri("", uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ex) {
                intent.setType("text/plain");
            }
        } else {
            intent.setType("text/plain");
        }
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException ex) {
            call.reject("not_installed");
        }
    }
}
