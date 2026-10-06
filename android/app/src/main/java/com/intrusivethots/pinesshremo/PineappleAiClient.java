package com.intrusivethots.pinesshremo;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** HTTPS client for the operator's own AI provider. The API key is never placed in a URL. */
public final class PineappleAiClient {
    private static final Pattern MODEL = Pattern.compile("^[A-Za-z0-9._:-]{1,80}$");
    private static final int CONNECT_MS = 15000;
    private static final int READ_MS = 45000;

    private PineappleAiClient() {}

    public static String defaultModel(String provider) {
        if ("anthropic".equals(provider)) return "claude-3-5-haiku-20241022";
        if ("gemini".equals(provider)) return "gemini-2.5-flash";
        return "gpt-4o-mini";
    }

    public static String sanitizeModel(String model, String provider) {
        if (model != null && MODEL.matcher(model.trim()).matches()) return model.trim();
        return defaultModel(provider);
    }

    public static String complete(String provider, String model, String apiKey, String system, String user) throws Exception {
        if (!"openai".equals(provider) && !"anthropic".equals(provider) && !"gemini".equals(provider)) {
            throw new IllegalArgumentException("Choose OpenAI, Anthropic, or Gemini.");
        }
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalArgumentException("Save an API key in Config before using AI.");
        }
        if (user == null || user.trim().isEmpty()) {
            throw new IllegalArgumentException("There is nothing to send to the provider.");
        }
        String safeModel = sanitizeModel(model, provider);
        String url;
        if ("openai".equals(provider)) {
            url = "https://api.openai.com/v1/chat/completions";
        } else if ("anthropic".equals(provider)) {
            url = "https://api.anthropic.com/v1/messages";
        } else {
            url = "https://generativelanguage.googleapis.com/v1beta/models/" + safeModel + ":generateContent";
        }
        return completeAt(new URL(url), provider, safeModel, apiKey.trim(), system == null ? "" : system, user);
    }

    static String completeAt(URL url, String provider, String model, String apiKey, String system, String user) throws Exception {
        String payload;
        if ("openai".equals(provider)) {
            payload = "{\"model\":" + jsonString(model)
                + ",\"temperature\":0.2,\"messages\":["
                + "{\"role\":\"system\",\"content\":" + jsonString(system) + "},"
                + "{\"role\":\"user\",\"content\":" + jsonString(user) + "}]}";
        } else if ("anthropic".equals(provider)) {
            payload = "{\"model\":" + jsonString(model)
                + ",\"max_tokens\":1200,\"system\":" + jsonString(system)
                + ",\"messages\":[{\"role\":\"user\",\"content\":" + jsonString(user) + "}]}";
        } else {
            payload = "{\"systemInstruction\":{\"parts\":[{\"text\":" + jsonString(system) + "}]},"
                + "\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":" + jsonString(user) + "}]}]}";
        }

        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(CONNECT_MS);
        connection.setReadTimeout(READ_MS);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        if ("openai".equals(provider)) {
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        } else if ("anthropic".equals(provider)) {
            connection.setRequestProperty("x-api-key", apiKey);
            connection.setRequestProperty("anthropic-version", "2023-06-01");
        } else {
            connection.setRequestProperty("x-goog-api-key", apiKey);
        }

        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(bytes);
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readLimited(stream, 200_000);
        if (status < 200 || status >= 300) {
            throw new IllegalStateException(redact(errorText(body, status)));
        }
        String text = extractText(provider, body);
        if (text == null || text.trim().isEmpty()) {
            throw new IllegalStateException("The provider returned an empty response.");
        }
        return text;
    }

    static String extractText(String provider, String body) {
        if ("openai".equals(provider)) return readJsonStringAfter(body, "content");
        return readJsonStringAfter(body, "text");
    }

    static String jsonString(String value) {
        StringBuilder out = new StringBuilder("\"");
        String text = value == null ? "" : value;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.append('"').toString();
    }

    static String readJsonStringAfter(String json, String field) {
        if (json == null) return null;
        String needle = "\"" + field + "\"";
        int at = json.indexOf(needle);
        if (at < 0) return null;
        int i = at + needle.length();
        while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
        if (i >= json.length() || json.charAt(i) != ':') return null;
        i++;
        while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
        if (i >= json.length() || json.charAt(i) != '"') return null;
        i++;
        StringBuilder out = new StringBuilder();
        while (i < json.length()) {
            char c = json.charAt(i);
            if (c == '"') return out.toString();
            if (c == '\\') {
                i++;
                if (i >= json.length()) return null;
                char escaped = json.charAt(i);
                switch (escaped) {
                    case '"':
                    case '\\':
                    case '/':
                        out.append(escaped);
                        break;
                    case 'n': out.append('\n'); break;
                    case 'r': out.append('\r'); break;
                    case 't': out.append('\t'); break;
                    case 'u':
                        if (i + 4 >= json.length()) return null;
                        int code = Integer.parseInt(json.substring(i + 1, i + 5), 16);
                        out.append((char) code);
                        i += 4;
                        break;
                    default:
                        out.append(escaped);
                }
            } else {
                out.append(c);
            }
            i++;
        }
        return null;
    }

    private static String readLimited(InputStream stream, int limit) throws Exception {
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[2048];
            int count;
            while ((count = reader.read(buffer)) >= 0 && out.length() < limit) {
                out.append(buffer, 0, Math.min(count, limit - out.length()));
            }
        }
        return out.toString();
    }

    private static String errorText(String body, int status) {
        String message = readJsonStringAfter(body, "message");
        if (message != null && !message.isEmpty()) return message;
        if (body != null && !body.isEmpty()) return body.length() > 300 ? body.substring(0, 300) : body;
        return "Provider returned HTTP " + status;
    }

    static String redact(String text) {
        if (text == null) return "";
        return text
            .replaceAll("sk-[A-Za-z0-9_-]{8,}", "sk-redacted")
            .replaceAll("AIza[0-9A-Za-z_\\-]{10,}", "AIza-redacted");
    }
}
