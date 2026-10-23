package app.dramora;

import android.content.Context;
import android.net.Uri;

final class Prefs {
    private static final String NAME = "dramora";
    private static final String KEY = "server_url";

    private Prefs() {}

    static String url(Context context) {
        String value = context.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY, null);
        if (value == null || value.isEmpty()) return null;
        return value;
    }

    static void save(Context context, String url) {
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit().putString(KEY, url).apply();
    }

    static String host(Context context) {
        String value = url(context);
        if (value == null) return null;
        return Uri.parse(value).getHost();
    }
}
