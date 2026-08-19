package com.arfipod.decksave;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.UserInfo;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Vector;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends Activity {
    private static final int REQ_KEY = 1001;
    private static final String PREFS = "deck_save_prefs";
    private static final String KEY_ALIAS = "er_deck_backup_profile_key_v1";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private EditText host, port, user, password, keyPassphrase;
    private TextView keyLabel, profileStatus, status;
    private Button chooseKey, clearProfile, download;
    private CheckBox includeBak, rememberProfile, showSecrets;
    private ProgressBar progress;
    private Uri keyUri;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        buildUi();
        loadPrefs();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private EditText field(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setInputType(inputType);
        e.setSingleLine(true);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        return e;
    }

    private EditText secretField(String hint) {
        EditText e = field(hint, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        // Explicit transformation avoids OEM keyboards/themes rendering a password as plain text.
        e.setTransformationMethod(PasswordTransformationMethod.getInstance());
        e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        return e;
    }

    private TextView text(String value, float sp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setPadding(0, dp(5), 0, dp(5));
        return t;
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = text("Elden Ring · Steam Deck Backup", 24);
        title.setTypeface(null, 1);
        root.addView(title);
        root.addView(text("Descarga por SSH tu ER0000.sl2 sin modificar la partida de la Deck.", 15));

        root.addView(text("Conexión SSH", 18));
        host = field("IP o nombre (ej. 192.168.1.50)", InputType.TYPE_CLASS_TEXT);
        port = field("Puerto SSH", InputType.TYPE_CLASS_NUMBER);
        user = field("Usuario", InputType.TYPE_CLASS_TEXT);
        password = secretField("Contraseña SSH (vacío si usas clave)");
        root.addView(host);
        root.addView(port);
        root.addView(user);
        root.addView(password);

        showSecrets = new CheckBox(this);
        showSecrets.setText("Mostrar contraseña y passphrase");
        showSecrets.setChecked(false);
        showSecrets.setOnCheckedChangeListener((buttonView, isChecked) -> setSecretsVisible(isChecked));
        root.addView(showSecrets);

        root.addView(text("Clave privada opcional", 18));
        LinearLayout keyRow = new LinearLayout(this);
        keyRow.setOrientation(LinearLayout.HORIZONTAL);
        keyRow.setGravity(Gravity.CENTER_VERTICAL);
        chooseKey = new Button(this);
        chooseKey.setText("Elegir clave SSH");
        chooseKey.setOnClickListener(v -> pickKey());
        keyLabel = text("Ninguna clave seleccionada", 14);
        keyLabel.setPadding(dp(12), 0, 0, 0);
        keyRow.addView(chooseKey);
        keyRow.addView(keyLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(keyRow);
        keyPassphrase = secretField("Passphrase de la clave (si tiene)");
        root.addView(keyPassphrase);

        root.addView(text("Perfil", 18));
        rememberProfile = new CheckBox(this);
        rememberProfile.setText("Guardar este perfil SSH en este dispositivo");
        rememberProfile.setChecked(true);
        root.addView(rememberProfile);
        profileStatus = text("No hay perfil guardado todavía.", 13);
        root.addView(profileStatus);
        clearProfile = new Button(this);
        clearProfile.setText("Borrar perfil guardado");
        clearProfile.setOnClickListener(v -> clearStoredProfile(true));
        root.addView(clearProfile);

        includeBak = new CheckBox(this);
        includeBak.setText("Descargar también ER0000.sl2.bak si existe");
        includeBak.setChecked(true);
        root.addView(includeBak);

        download = new Button(this);
        download.setText("Conectar y descargar partida");
        download.setOnClickListener(v -> startDownload());
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        bp.setMargins(0, dp(16), 0, dp(8));
        root.addView(download, bp);

        progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(32)));

        status = text("Listo.", 14);
        root.addView(status);
        root.addView(text(
                "Busca automáticamente:\n~/.local/share/Steam/steamapps/compatdata/1245620/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing/<SteamID>/ER0000.sl2\n\n" +
                "Guarda copias en Descargas/EldenRingBackups.", 13));

        setContentView(scroll);
    }

    private void setSecretsVisible(boolean visible) {
        int passwordCursor = password == null ? 0 : password.getSelectionStart();
        int passphraseCursor = keyPassphrase == null ? 0 : keyPassphrase.getSelectionStart();
        if (password != null) {
            password.setTransformationMethod(visible ? null : PasswordTransformationMethod.getInstance());
            password.setSelection(Math.max(0, Math.min(passwordCursor, password.length())));
        }
        if (keyPassphrase != null) {
            keyPassphrase.setTransformationMethod(visible ? null : PasswordTransformationMethod.getInstance());
            keyPassphrase.setSelection(Math.max(0, Math.min(passphraseCursor, keyPassphrase.length())));
        }
    }

    private void loadPrefs() {
        boolean saved = prefs.getBoolean("profile_saved", false);
        rememberProfile.setChecked(saved || !prefs.contains("profile_saved"));

        if (!saved) {
            host.setText(prefs.getString("host", "")); // migration from v1 if installed over a compatible build
            port.setText(prefs.getString("port", "22"));
            user.setText(prefs.getString("user", "deck"));
            includeBak.setChecked(prefs.getBoolean("include_bak", true));
            profileStatus.setText("No hay perfil guardado todavía.");
            return;
        }

        host.setText(prefs.getString("host", ""));
        port.setText(prefs.getString("port", "22"));
        user.setText(prefs.getString("user", "deck"));
        includeBak.setChecked(prefs.getBoolean("include_bak", true));

        try {
            password.setText(decryptSecret(prefs.getString("password_enc", "")));
            keyPassphrase.setText(decryptSecret(prefs.getString("key_passphrase_enc", "")));
        } catch (Exception e) {
            // If the Keystore entry was invalidated, never fall back to displaying ciphertext.
            password.setText("");
            keyPassphrase.setText("");
            prefs.edit().remove("password_enc").remove("key_passphrase_enc").apply();
            profileStatus.setText("Perfil cargado; vuelve a escribir la contraseña una vez.");
        }

        String keyUriText = prefs.getString("key_uri", "");
        if (!keyUriText.isEmpty()) {
            try {
                keyUri = Uri.parse(keyUriText);
                updateKeyLabel();
            } catch (Exception ignored) {
                keyUri = null;
            }
        }
        if (profileStatus.getText().toString().startsWith("No hay")) {
            profileStatus.setText("Perfil SSH guardado y cargado.");
        }
        setSecretsVisible(false);
    }

    private void saveProfile(String h, int p, String u, String pw, String keyPhrase, Uri selectedKey, boolean wantBak) throws Exception {
        SharedPreferences.Editor editor = prefs.edit()
                .putBoolean("profile_saved", true)
                .putString("host", h)
                .putString("port", Integer.toString(p))
                .putString("user", u)
                .putBoolean("include_bak", wantBak)
                .putString("password_enc", encryptSecret(pw))
                .putString("key_passphrase_enc", encryptSecret(keyPhrase));
        if (selectedKey != null) editor.putString("key_uri", selectedKey.toString());
        else editor.remove("key_uri");
        editor.apply();
    }

    private void clearStoredProfile(boolean clearFields) {
        try {
            if (keyUri != null) {
                try {
                    getContentResolver().releasePersistableUriPermission(keyUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
            }
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {}

        prefs.edit().clear().apply();
        keyUri = null;
        keyLabel.setText("Ninguna clave seleccionada");
        profileStatus.setText("No hay perfil guardado todavía.");
        rememberProfile.setChecked(true);
        if (clearFields) {
            host.setText("");
            port.setText("22");
            user.setText("deck");
            password.setText("");
            keyPassphrase.setText("");
            includeBak.setChecked(true);
            showSecrets.setChecked(false);
            toast("Perfil guardado borrado.");
        }
    }

    private SecretKey getOrCreateProfileKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        java.security.Key existing = ks.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private String encryptSecret(String plain) throws Exception {
        if (plain == null || plain.isEmpty()) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateProfileKey());
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
                Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decryptSecret(String encoded) throws Exception {
        if (encoded == null || encoded.isEmpty()) return "";
        int sep = encoded.indexOf('.');
        if (sep <= 0 || sep >= encoded.length() - 1) throw new Exception("Formato cifrado inválido");
        byte[] iv = Base64.decode(encoded.substring(0, sep), Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(encoded.substring(sep + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateProfileKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private void pickKey() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType("*/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(i, REQ_KEY);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_KEY && resultCode == RESULT_OK && data != null && data.getData() != null) {
            keyUri = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(keyUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}
            updateKeyLabel();
        }
    }

    private void updateKeyLabel() {
        if (keyUri == null) {
            keyLabel.setText("Ninguna clave seleccionada");
            return;
        }
        String last = keyUri.getLastPathSegment();
        keyLabel.setText(last == null || last.isEmpty() ? "Clave SSH seleccionada" : last);
    }

    private void startDownload() {
        String h = host.getText().toString().trim();
        String p = port.getText().toString().trim();
        String u = user.getText().toString().trim();
        String pw = password.getText().toString();
        String keyPhrase = keyPassphrase.getText().toString();
        if (h.isEmpty() || p.isEmpty() || u.isEmpty()) {
            toast("Completa IP/nombre, puerto y usuario.");
            return;
        }
        if (pw.isEmpty() && keyUri == null) {
            toast("Escribe la contraseña o selecciona una clave privada.");
            return;
        }
        final int portNumber;
        try {
            portNumber = Integer.parseInt(p);
            if (portNumber < 1 || portNumber > 65535) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            toast("El puerto SSH no es válido.");
            return;
        }

        Uri selectedKey = keyUri;
        boolean wantBak = includeBak.isChecked();
        boolean shouldRemember = rememberProfile.isChecked();
        setBusy(true, "Conectando por SSH…");
        executor.submit(() -> performDownload(h, portNumber, u, pw, keyPhrase, selectedKey, wantBak, shouldRemember));
    }

    private void performDownload(String h, int p, String u, String pw, String keyPhrase,
                                 Uri selectedKey, boolean wantBak, boolean shouldRemember) {
        Session session = null;
        ChannelSftp sftp = null;
        try {
            JSch jsch = new JSch();
            File knownHosts = new File(getFilesDir(), "known_hosts");
            if (!knownHosts.exists()) knownHosts.createNewFile();
            jsch.setKnownHosts(knownHosts.getAbsolutePath());

            if (selectedKey != null) {
                byte[] key = readAll(getContentResolver().openInputStream(selectedKey));
                byte[] pass = keyPhrase.isEmpty() ? null : keyPhrase.getBytes(StandardCharsets.UTF_8);
                jsch.addIdentity("android-imported-key", key, null, pass);
            }

            session = jsch.getSession(u, h, p);
            if (!pw.isEmpty()) session.setPassword(pw);
            session.setUserInfo(new DialogUserInfo(pw, keyPhrase));
            Properties cfg = new Properties();
            cfg.put("StrictHostKeyChecking", "ask");
            cfg.put("PreferredAuthentications", selectedKey != null
                    ? "publickey,password,keyboard-interactive"
                    : "password,keyboard-interactive");
            session.setConfig(cfg);
            session.connect(12000);

            if (shouldRemember) {
                try {
                    saveProfile(h, p, u, pw, keyPhrase, selectedKey, wantBak);
                    runOnUiThread(() -> profileStatus.setText("Perfil SSH guardado y cargado."));
                } catch (Exception e) {
                    runOnUiThread(() -> profileStatus.setText("Conexión correcta, pero no se pudo guardar el perfil cifrado."));
                }
            } else {
                clearStoredProfile(false);
                runOnUiThread(() -> profileStatus.setText("Perfil no guardado."));
            }

            runOnUiThread(() -> status.setText("SSH conectado. Buscando perfiles de Elden Ring…"));
            sftp = (ChannelSftp) session.openChannel("sftp");
            sftp.connect(10000);

            String home = sftp.pwd();
            String root = home + "/.local/share/Steam/steamapps/compatdata/1245620/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing";
            List<SaveCandidate> saves = findSaves(sftp, root);
            if (saves.isEmpty()) {
                throw new Exception("No encontré ER0000.sl2 en " + root + ". Comprueba que Elden Ring se haya ejecutado al menos una vez con ese usuario.");
            }

            SaveCandidate chosen = chooseCandidateBlocking(saves);
            if (chosen == null) {
                runOnUiThread(() -> setBusy(false, "Cancelado."));
                return;
            }

            runOnUiThread(() -> status.setText("Descargando " + chosen.steamId + "/ER0000.sl2…"));
            String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
            String baseName = "EldenRing-" + chosen.steamId + "-" + stamp;
            saveRemoteFile(sftp, chosen.path, baseName + "-ER0000.sl2");

            boolean bakSaved = false;
            if (wantBak) {
                String bak = chosen.path + ".bak";
                if (exists(sftp, bak)) {
                    saveRemoteFile(sftp, bak, baseName + "-ER0000.sl2.bak");
                    bakSaved = true;
                }
            }
            final boolean finalBakSaved = bakSaved;
            runOnUiThread(() -> {
                setBusy(false, "Backup completado en Descargas/EldenRingBackups" + (finalBakSaved ? " (incluye .bak)." : "."));
                new AlertDialog.Builder(this)
                        .setTitle("Backup completado")
                        .setMessage("Se ha descargado la partida de " + chosen.steamId + " en Descargas/EldenRingBackups." +
                                (finalBakSaved ? "\nTambién se guardó ER0000.sl2.bak." : ""))
                        .setPositiveButton("OK", null)
                        .show();
            });
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.toString() : e.getMessage();
            runOnUiThread(() -> setBusy(false, "Error: " + msg));
        } finally {
            if (sftp != null && sftp.isConnected()) sftp.disconnect();
            if (session != null && session.isConnected()) session.disconnect();
        }
    }

    private List<SaveCandidate> findSaves(ChannelSftp sftp, String root) throws SftpException {
        List<SaveCandidate> result = new ArrayList<>();
        Vector<ChannelSftp.LsEntry> entries = sftp.ls(root);
        for (ChannelSftp.LsEntry e : entries) {
            String name = e.getFilename();
            if (name.equals(".") || name.equals("..") || !e.getAttrs().isDir() || !name.matches("\\d+")) continue;
            String path = root + "/" + name + "/ER0000.sl2";
            try {
                SftpATTRS attrs = sftp.stat(path);
                result.add(new SaveCandidate(name, path, attrs.getSize(), attrs.getMTime()));
            } catch (SftpException ignored) {}
        }
        return result;
    }

    private SaveCandidate chooseCandidateBlocking(List<SaveCandidate> saves) throws InterruptedException {
        if (saves.size() == 1) return saves.get(0);
        CountDownLatch latch = new CountDownLatch(1);
        final SaveCandidate[] selected = new SaveCandidate[1];
        runOnUiThread(() -> {
            String[] items = new String[saves.size()];
            for (int i = 0; i < saves.size(); i++) {
                SaveCandidate s = saves.get(i);
                items[i] = s.steamId + "  ·  " + humanSize(s.size);
            }
            new AlertDialog.Builder(this)
                    .setTitle("Elige el perfil de Elden Ring")
                    .setItems(items, (d, which) -> {
                        selected[0] = saves.get(which);
                        latch.countDown();
                    })
                    .setOnCancelListener(d -> latch.countDown())
                    .show();
        });
        latch.await();
        return selected[0];
    }

    private boolean exists(ChannelSftp sftp, String path) {
        try {
            sftp.stat(path);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void saveRemoteFile(ChannelSftp sftp, String remotePath, String filename) throws Exception {
        try (InputStream in = sftp.get(remotePath); OutputStream out = openDownload(filename)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.flush();
        }
    }

    private OutputStream openDownload(String filename) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/EldenRingBackups");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Android no pudo crear el archivo en Descargas.");
            OutputStream out = getContentResolver().openOutputStream(uri, "w");
            if (out == null) throw new Exception("Android no pudo abrir el archivo de destino.");
            return out;
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "EldenRingBackups");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("No se pudo crear la carpeta de backups.");
            return new FileOutputStream(new File(dir, filename));
        }
    }

    private byte[] readAll(InputStream in) throws Exception {
        if (in == null) throw new Exception("No se pudo leer la clave privada.");
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private void setBusy(boolean busy, String message) {
        download.setEnabled(!busy);
        chooseKey.setEnabled(!busy);
        clearProfile.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        status.setText(message);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }

    private static String humanSize(long size) {
        if (size < 1024) return size + " B";
        if (size < 1024 * 1024) return String.format(Locale.US, "%.1f KiB", size / 1024.0);
        return String.format(Locale.US, "%.1f MiB", size / 1048576.0);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class SaveCandidate {
        final String steamId, path;
        final long size;
        final int mtime;

        SaveCandidate(String steamId, String path, long size, int mtime) {
            this.steamId = steamId;
            this.path = path;
            this.size = size;
            this.mtime = mtime;
        }
    }

    private final class DialogUserInfo implements UserInfo {
        private final String passwordValue;
        private final String passphraseValue;

        DialogUserInfo(String passwordValue, String passphraseValue) {
            this.passwordValue = passwordValue;
            this.passphraseValue = passphraseValue;
        }

        @Override
        public String getPassword() {
            return passwordValue;
        }

        @Override
        public boolean promptYesNo(String message) {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicBoolean yes = new AtomicBoolean(false);
            runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Verificar servidor SSH")
                    .setMessage(message)
                    .setPositiveButton("Confiar", (d, w) -> {
                        yes.set(true);
                        latch.countDown();
                    })
                    .setNegativeButton("Cancelar", (d, w) -> latch.countDown())
                    .setOnCancelListener(d -> latch.countDown())
                    .show());
            try {
                latch.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return yes.get();
        }

        @Override
        public String getPassphrase() {
            return passphraseValue;
        }

        @Override
        public boolean promptPassphrase(String message) {
            return !passphraseValue.isEmpty();
        }

        @Override
        public boolean promptPassword(String message) {
            return !passwordValue.isEmpty();
        }

        @Override
        public void showMessage(String message) {
            runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("OK", null)
                    .show());
        }
    }
}
