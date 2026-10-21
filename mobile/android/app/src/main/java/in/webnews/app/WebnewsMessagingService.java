package in.webnews.app;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Instagram-style pushes (owner 2026-10-16). The backend sends data only (backend lib/push.ts); this draws it: the
 * person's photo round on the right, story pushes expanding to the story's photo like a post, chats stacked as a
 * conversation with the sender's photo, one action button ("Read now", "Reply"…), all grouped under WebNEWS in the brand
 * red. Tapping opens the page in the app (the push plugin hands `url` to the site, frontend lib/native-push.ts).
 * While the app is open on screen nothing is drawn: the site shows its own popup.
 */
public class WebnewsMessagingService extends MessagingService {
    private static final String CHANNEL_ID = "webnews";
    private static final String GROUP = "in.webnews.app.NOTIFICATIONS";
    private static final int BRAND = 0xFFE30613;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // The site (when running) still hears about it, as before.
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (!data.containsKey("wn_title") || appInForeground()) return;
        try {
            show(data, remoteMessage.getMessageId());
        } catch (Exception ignored) {
            // A push that can't be drawn is dropped rather than crashing the app.
        }
    }

    private void show(Map<String, String> data, @Nullable String messageId) {
        Context context = getApplicationContext();
        ensureChannel(context);
        String title = data.get("wn_title");
        String body = data.get("wn_body");
        String url = data.get("url");
        String tag = data.containsKey("wn_tag") ? data.get("wn_tag") : String.valueOf(System.currentTimeMillis());
        String style = data.containsKey("wn_style") ? data.get("wn_style") : "text";
        Bitmap avatar = circle(download(data.get("wn_avatar")));
        Bitmap picture = "picture".equals(style) ? download(data.get("wn_image")) : null;
        String thread = data.get("wn_thread");
        int id = (thread != null ? thread : tag).hashCode();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(BRAND)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory("message".equals(style) ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_SOCIAL)
            .setGroup(GROUP)
            .setContentIntent(openIntent(context, url, messageId, id));
        if (avatar != null) builder.setLargeIcon(avatar);

        if ("message".equals(style)) {
            // A chat: the sender's name and photo, each new message stacked under the last (like Instagram DMs).
            String sender = data.containsKey("wn_sender") ? data.get("wn_sender") : title;
            Person.Builder who = new Person.Builder().setName(sender);
            if (avatar != null) who.setIcon(IconCompat.createWithBitmap(avatar));
            NotificationCompat.MessagingStyle chat = new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build());
            chat.setConversationTitle(title);
            chat.addMessage(body, System.currentTimeMillis(), who.build());
            builder.setStyle(chat);
        } else if (picture != null) {
            // Story pushes expand to the story's photo; the person's photo steps aside while expanded.
            builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(picture).bigLargeIcon((Bitmap) null).setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        String actionLabel = data.get("wn_action_label");
        String actionUrl = data.get("wn_action_url");
        if (actionLabel != null && actionUrl != null) {
            builder.addAction(0, actionLabel, openIntent(context, actionUrl, messageId, id + 1));
        }

        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return;
        manager.notify(tag, id, builder.build());
        // The stack's summary (several WebNEWS pushes fold into one group).
        manager.notify(
            "summary",
            0,
            new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(BRAND)
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setAutoCancel(true)
                .build()
        );
    }

    /** Opens the app on `url`, the way a standard push tap does (the push plugin passes the extras to the site). */
    private PendingIntent openIntent(Context context, @Nullable String url, @Nullable String messageId, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", messageId != null ? messageId : String.valueOf(requestCode));
        if (url != null) intent.putExtra("url", url);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "WebNEWS", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Followers, stories, likes, comments, messages and press meets");
        manager.createNotificationChannel(channel);
    }

    private boolean appInForeground() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    /** Fetches a picture (https only, 6 s at most); null when it can't. */
    @Nullable
    private static Bitmap download(@Nullable String address) {
        if (address == null || !address.startsWith("https://")) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            try (InputStream in = connection.getInputStream()) {
                return BitmapFactory.decodeStream(in);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** The person's photo, cut round like Instagram's. */
    @Nullable
    private static Bitmap circle(@Nullable Bitmap source) {
        if (source == null) return null;
        int size = Math.min(source.getWidth(), source.getHeight());
        Bitmap square = Bitmap.createBitmap(source, (source.getWidth() - size) / 2, (source.getHeight() - size) / 2, size, size);
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(out).drawCircle(size / 2f, size / 2f, size / 2f, paint);
        return out;
    }
}
