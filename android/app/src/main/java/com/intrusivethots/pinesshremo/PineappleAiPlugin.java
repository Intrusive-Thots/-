package com.intrusivethots.pinesshremo;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PineappleAi")
public class PineappleAiPlugin extends Plugin {
    private static final String PREFS = "pineapple_ai_secure";
    private static final String PROVIDER = "provider";
    private static final String MODEL = "model";
    private static final String API_KEY = "api_key";

    private SharedPreferences openPrefs() throws Exception {
        Context context = getContext();
        String masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
        return EncryptedSharedPreferences.create(
            PREFS,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    @PluginMethod
    public void save(PluginCall call) {
        String provider = call.getString("provider", "openai");
        if (!"openai".equals(provider) && !"anthropic".equals(provider) && !"gemini".equals(provider)) {
            call.reject("Choose OpenAI, Anthropic, or Gemini.");
            return;
        }
        String model = PineappleAiClient.sanitizeModel(call.getString("model", ""), provider);
        String apiKey = call.getString("apiKey", "");
        try {
            SharedPreferences prefs = openPrefs();
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(PROVIDER, provider);
            editor.putString(MODEL, model);
            if (apiKey != null && !apiKey.trim().isEmpty()) {
                editor.putString(API_KEY, apiKey.trim());
            }
            editor.apply();
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Could not save the AI key." : error.getMessage());
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            SharedPreferences prefs = openPrefs();
            String provider = prefs.getString(PROVIDER, "openai");
            String model = prefs.getString(MODEL, PineappleAiClient.defaultModel(provider));
            String apiKey = prefs.getString(API_KEY, "");
            JSObject body = new JSObject();
            body.put("provider", provider);
            body.put("model", model);
            body.put("hasKey", apiKey != null && !apiKey.isEmpty());
            call.resolve(body);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Could not read AI settings." : error.getMessage());
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            openPrefs().edit().clear().apply();
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Could not clear AI settings." : error.getMessage());
        }
    }

    @PluginMethod
    public void complete(PluginCall call) {
        String system = call.getString("system", "");
        String user = call.getString("user", "");
        Thread worker = new Thread(() -> {
            try {
                SharedPreferences prefs = openPrefs();
                String provider = prefs.getString(PROVIDER, "openai");
                String model = prefs.getString(MODEL, "");
                String apiKey = prefs.getString(API_KEY, "");
                String text = PineappleAiClient.complete(provider, model, apiKey, system, user);
                JSObject body = new JSObject();
                body.put("text", text);
                call.resolve(body);
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null || message.isEmpty() ? "The AI request failed." : message);
            }
        }, "pineapple-ai");
        worker.start();
    }
}
