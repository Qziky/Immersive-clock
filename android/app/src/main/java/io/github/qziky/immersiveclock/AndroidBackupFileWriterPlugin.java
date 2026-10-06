package io.github.qziky.immersiveclock;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AndroidBackupFileWriter")
public class AndroidBackupFileWriterPlugin extends Plugin {

    private final Object stateLock = new Object();
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private OutputStream backupOutputStream;
    private boolean saveRequestActive;

    @PluginMethod
    public void beginSave(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("A backup filename is required.");
            return;
        }

        synchronized (stateLock) {
            if (saveRequestActive) {
                call.reject("A backup export is already in progress.");
                return;
            }
            saveRequestActive = true;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        try {
            startActivityForResult(call, intent, "handleSaveResult");
        } catch (Exception error) {
            resetSaveState();
            call.reject("Unable to open the Android save dialog.", error);
        }
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        Intent resultIntent = result.getData();
        Uri targetUri = resultIntent == null ? null : resultIntent.getData();
        if (result.getResultCode() != Activity.RESULT_OK || targetUri == null) {
            resetSaveState();
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        ioExecutor.execute(() -> {
            try {
                OutputStream stream = getContext().getContentResolver().openOutputStream(targetUri, "wt");
                if (stream == null) throw new IOException("Android could not open the selected file.");
                synchronized (stateLock) {
                    backupOutputStream = stream;
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                call.resolve(response);
            } catch (Exception error) {
                resetSaveState();
                call.reject("Unable to create the backup file.", error);
            }
        });
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String encodedChunk = call.getString("base64");
        if (encodedChunk == null) {
            call.reject("Backup data is missing.");
            return;
        }

        ioExecutor.execute(() -> {
            try {
                OutputStream stream;
                synchronized (stateLock) {
                    stream = backupOutputStream;
                }
                if (stream == null) throw new IOException("No backup file is open.");
                stream.write(Base64.decode(encodedChunk, Base64.DEFAULT));
                call.resolve();
            } catch (Exception error) {
                closeOutputStream();
                call.reject("Unable to write the backup file.", error);
            }
        });
    }

    @PluginMethod
    public void finishSave(PluginCall call) {
        ioExecutor.execute(() -> {
            try {
                OutputStream stream;
                synchronized (stateLock) {
                    stream = backupOutputStream;
                    backupOutputStream = null;
                    saveRequestActive = false;
                }
                if (stream == null) throw new IOException("No backup file is open.");
                stream.flush();
                stream.close();
                call.resolve();
            } catch (Exception error) {
                closeOutputStream();
                call.reject("Unable to finish the backup file.", error);
            }
        });
    }

    @PluginMethod
    public void abortSave(PluginCall call) {
        ioExecutor.execute(() -> {
            closeOutputStream();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        closeOutputStream();
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private void closeOutputStream() {
        OutputStream stream;
        synchronized (stateLock) {
            stream = backupOutputStream;
            backupOutputStream = null;
            saveRequestActive = false;
        }
        if (stream == null) return;
        try {
            stream.close();
        } catch (IOException ignored) {
            // The export is already being aborted; there is no useful recovery action here.
        }
    }

    private void resetSaveState() {
        synchronized (stateLock) {
            backupOutputStream = null;
            saveRequestActive = false;
        }
    }
}
