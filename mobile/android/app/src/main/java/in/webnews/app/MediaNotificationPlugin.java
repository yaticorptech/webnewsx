package in.webnews.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The "now playing" notification for Listen (owner 2026-10-07, like Spotify): the story's title with play / pause, a
 * seek bar, 10 s back / forward and stop, in the notification shade, on the lock screen and on headphones. The site
 * shows it, keeps its state (playing / paused, position and duration in seconds) and hides it (frontend
 * lib/media-notification.ts); every button comes back as an "action" event ({ action: "play" | "pause" | "stop" |
 * "rewind" | "forward" } or { action: "seek", position: seconds }) and the site does the rest. Android 13+ draws the
 * buttons from the media session's playback state (back, forward and stop are custom actions there); older versions
 * from the notification's own actions. Media notifications don't need the notification permission.
 */
@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {
    private static final String CHANNEL = "listen";
    private static final int NOTIFICATION_ID = 7101;
    private static final String BROADCAST = "in.webnews.app.MEDIA_ACTION";

    private MediaSession session;
    private BroadcastReceiver receiver;
    private Bitmap artwork;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                if (action != null) emit(action);
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(BROADCAST), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "WebNEWS");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", true));
        long positionMs = Math.round(call.getDouble("position", 0.0) * 1000);
        long durationMs = Math.round(call.getDouble("duration", 0.0) * 1000);
        Context context = getContext();

        if (session == null) {
            session = new MediaSession(context, "WebNEWS Listen");
            session.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    emit("play");
                }

                @Override
                public void onPause() {
                    emit("pause");
                }

                @Override
                public void onStop() {
                    emit("stop");
                }

                @Override
                public void onSeekTo(long position) {
                    JSObject data = new JSObject();
                    data.put("action", "seek");
                    data.put("position", position / 1000.0);
                    notifyListeners("action", data);
                }

                @Override
                public void onRewind() {
                    emit("rewind");
                }

                @Override
                public void onFastForward() {
                    emit("forward");
                }

                @Override
                public void onCustomAction(String action, Bundle extras) {
                    emit(action);
                }
            }, new Handler(Looper.getMainLooper()));
            session.setActive(true);
        }
        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            // A duration (with ACTION_SEEK_TO) gives the notification its seek bar.
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
            .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork())
            .build());
        // Android 13+ puts the first two custom actions in the back / forward slots (no skip actions here).
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD)
            .addCustomAction(new PlaybackState.CustomAction.Builder("rewind", "Back 10 seconds", R.drawable.ic_media_back_10).build())
            .addCustomAction(new PlaybackState.CustomAction.Builder("forward", "Forward 10 seconds", R.drawable.ic_media_forward_10).build())
            .addCustomAction(new PlaybackState.CustomAction.Builder("stop", "Stop", R.drawable.ic_media_stop).build())
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, positionMs, playing ? 1f : 0f)
            .build());

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (manager.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL, "Listening", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Play and pause a story being read aloud");
                channel.setShowBadge(false);
                manager.createNotificationChannel(channel);
            }
            builder = new Notification.Builder(context, CHANNEL);
        } else {
            builder = new Notification.Builder(context);
        }
        builder
            .setSmallIcon(R.drawable.ic_stat_bars)
            .setLargeIcon(artwork())
            .setContentTitle(title)
            .setContentText(artist)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            // Can't be swiped away while it plays; paused, swiping it away stops Listen.
            .setOngoing(playing)
            .setDeleteIntent(actionIntent("stop", 3))
            .setContentIntent(openAppIntent())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_media_back_10), "Back 10 seconds", actionIntent("rewind", 4)).build())
            .addAction(new Notification.Action.Builder(
                Icon.createWithResource(context, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
                playing ? "Pause" : "Play",
                actionIntent(playing ? "pause" : "play", playing ? 1 : 0)
            ).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_media_forward_10), "Forward 10 seconds", actionIntent("forward", 5)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_media_stop), "Stop", actionIntent("stop", 2)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        manager.notify(NOTIFICATION_ID, builder.build());
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        clear();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        clear();
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // Already gone.
            }
            receiver = null;
        }
    }

    private void clear() {
        getContext().getSystemService(NotificationManager.class).cancel(NOTIFICATION_ID);
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
    }

    private void emit(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("action", data);
    }

    /** A button's broadcast, back to this plugin's receiver (only this app can send it). */
    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(BROADCAST).setPackage(getContext().getPackageName()).putExtra("action", action);
        return PendingIntent.getBroadcast(getContext(), requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Tapping the notification brings the app back (on the story being read). */
    private PendingIntent openAppIntent() {
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
        if (intent == null) intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(getContext(), 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The app icon as the notification's artwork (an adaptive icon is a drawable, not a bitmap: drawn once). */
    private Bitmap artwork() {
        if (artwork == null) {
            Drawable icon = getContext().getPackageManager().getApplicationIcon(getContext().getApplicationInfo());
            int size = 256;
            artwork = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            icon.setBounds(0, 0, size, size);
            icon.draw(new Canvas(artwork));
        }
        return artwork;
    }
}
