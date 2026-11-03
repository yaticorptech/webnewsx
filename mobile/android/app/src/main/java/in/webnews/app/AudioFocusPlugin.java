package in.webnews.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * News radio and Listen take the phone's audio (owner 2026-11-03): while the app reads aloud, Spotify, YouTube and
 * other players pause, like any other audio app. The site calls request() when it starts speaking and abandon() when it
 * stops (frontend lib/speech.ts). Another app taking the audio back (a call, music started) comes back as a "lost"
 * event and the site stops reading.
 */
@CapacitorPlugin(name = "AudioFocus")
public class AudioFocusPlugin extends Plugin {
    private AudioFocusRequest focusRequest;
    private boolean held;

    private final AudioManager.OnAudioFocusChangeListener listener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            held = false;
            notifyListeners("lost", new JSObject());
        }
    };

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void request(PluginCall call) {
        AudioManager audio = audio();
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(listener)
                    .build();
            }
            result = audio.requestAudioFocus(focusRequest);
        } else {
            result = audio.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        held = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        JSObject out = new JSObject();
        out.put("granted", held);
        call.resolve(out);
    }

    @PluginMethod
    public void abandon(PluginCall call) {
        release();
        call.resolve();
    }

    private void release() {
        if (!held) return;
        held = false;
        AudioManager audio = audio();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audio.abandonAudioFocusRequest(focusRequest);
        } else {
            audio.abandonAudioFocus(listener);
        }
    }

    @Override
    protected void handleOnDestroy() {
        release();
    }
}
