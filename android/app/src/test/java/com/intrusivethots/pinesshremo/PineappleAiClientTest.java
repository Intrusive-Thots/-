package com.intrusivethots.pinesshremo;

import com.sun.net.httpserver.HttpServer;

import org.junit.Test;

import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PineappleAiClientTest {
    @Test
    public void readsAProviderReplyAndKeepsTheKeyOutOfTheUrl() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            assertEquals("Bearer test-key", auth);
            assertFalse(exchange.getRequestURI().toString().contains("test-key"));
            byte[] body = "{\"choices\":[{\"message\":{\"content\":\"{\\\"explanation\\\":\\\"ash has no base64\\\",\\\"command\\\":\\\"uptime\\\"}\"}}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            int port = server.getAddress().getPort();
            String text = PineappleAiClient.completeAt(
                new URL("http://127.0.0.1:" + port + "/v1/chat/completions"),
                "openai",
                "gpt-4o-mini",
                "test-key",
                "system",
                "user"
            );
            assertTrue(text.contains("uptime"));
        } finally {
            server.stop(0);
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
