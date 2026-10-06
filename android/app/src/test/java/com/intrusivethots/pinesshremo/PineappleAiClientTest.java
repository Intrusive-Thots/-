package com.intrusivethots.pinesshremo;

import org.junit.Test;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PineappleAiClientTest {
    @Test
    public void readsAProviderReplyAndKeepsTheKeyOutOfTheUrl() throws Exception {
        ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
        Thread worker = new Thread(() -> {
            try (Socket socket = server.accept()) {
                InputStream in = socket.getInputStream();
                byte[] buffer = new byte[8192];
                int count = in.read(buffer);
                String request = new String(buffer, 0, Math.max(count, 0), StandardCharsets.UTF_8);
                assertTrue(request.contains("Authorization: Bearer test-key"));
                assertFalse(request.startsWith("POST http") && request.contains("test-key"));
                assertFalse(request.split("\r\n")[0].contains("test-key"));
                byte[] body = "{\"choices\":[{\"message\":{\"content\":\"{\\\"explanation\\\":\\\"ash has no base64\\\",\\\"command\\\":\\\"uptime\\\"}\"}}]}"
                    .getBytes(StandardCharsets.UTF_8);
                String response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
                OutputStream out = socket.getOutputStream();
                out.write(response.getBytes(StandardCharsets.US_ASCII));
                out.write(body);
                out.flush();
            } catch (Exception error) {
                throw new RuntimeException(error);
            }
        });
        worker.start();
        try {
            String text = PineappleAiClient.completeAt(
                new URL("http://127.0.0.1:" + server.getLocalPort() + "/v1/chat/completions"),
                "openai",
                "gpt-4o-mini",
                "test-key",
                "system",
                "user"
            );
            assertTrue(text.contains("uptime"));
            worker.join(5000);
        } finally {
            server.close();
        }
    }

    @Test
    public void rejectsAModelThatCouldChangeTheRequestPath() {
        assertEquals("gemini-2.5-flash", PineappleAiClient.sanitizeModel("../admin", "gemini"));
        assertEquals("gpt-4o-mini", PineappleAiClient.sanitizeModel("gpt-4o-mini", "openai"));
    }

    @Test
    public void unescapesJsonStrings() {
        String raw = "{\"content\":\"line\\nnext\"}";
        assertEquals("line\nnext", PineappleAiClient.readJsonStringAfter(raw, "content"));
    }

    @Test
    public void redactsKeysInProviderErrors() {
        assertFalse(PineappleAiClient.redact("bad key sk-abcDEF123456").contains("abcDEF"));
    }
}
