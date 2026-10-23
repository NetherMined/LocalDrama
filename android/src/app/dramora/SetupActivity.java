package app.dramora;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.Toast;

public class SetupActivity extends Activity {
    public static final String EXTRA_FORCE = "force";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean force = getIntent().getBooleanExtra(EXTRA_FORCE, false);
        if (!force && Prefs.url(this) != null) {
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.activity_setup);
        EditText input = findViewById(R.id.serverUrl);
        String existing = Prefs.url(this);
        input.setText(existing != null ? existing : "http://");
        input.setSelection(input.getText().length());
        findViewById(R.id.connect).setOnClickListener(v -> connect(input));
        input.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO) {
                connect(input);
                return true;
            }
            return false;
        });
    }

    private void connect(EditText input) {
        String raw = input.getText().toString().trim();
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
            Toast.makeText(this, R.string.bad_url, Toast.LENGTH_LONG).show();
            return;
        }
        Uri uri = Uri.parse(raw);
        if (uri.getHost() == null || uri.getHost().isEmpty()) {
            Toast.makeText(this, R.string.bad_url, Toast.LENGTH_LONG).show();
            return;
        }
        while (raw.endsWith("/")) raw = raw.substring(0, raw.length() - 1);
        Prefs.save(this, raw);
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}
