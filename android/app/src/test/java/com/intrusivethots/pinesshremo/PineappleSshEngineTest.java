package com.intrusivethots.pinesshremo;

import org.junit.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class PineappleSshEngineTest {
    @Test(timeout = 30000)
    public void execTalksToARealSshServer() throws Exception {
        int port = 23000 + (int) (Math.random() * 1000);
        Path fixture = Path.of("..", "..", "scripts", "ssh-fixture.mjs").toAbsolutePath().normalize();
        Process server = new ProcessBuilder("node", fixture.toString(), "server", Integer.toString(port))
            .redirectErrorStream(true)
            .start();
        try {
            BufferedReader ready = new BufferedReader(new InputStreamReader(server.getInputStream(), StandardCharsets.UTF_8));
            String line = ready.readLine();
            assertTrue("fixture did not start: " + line, line != null && line.startsWith("READY"));
            Thread drain = new Thread(() -> {
                try {
                    while (ready.readLine() != null) {
                        // Keep the fixture from blocking on a full pipe.
                    }
                } catch (Exception ignored) {
                }
            });
            drain.setDaemon(true);
            drain.start();

            PineappleSshEngine.Config config = new PineappleSshEngine.Config();
            config.host = "127.0.0.1";
            config.port = port;
            config.username = "root";
            config.authType = "password";
            config.password = "secret";

            PineappleSshEngine.Result result = PineappleSshEngine.exec(config, "echo hello-from-ssh");
            assertEquals(0, result.exitCode);
            assertEquals("OUT:echo hello-from-ssh\n", result.stdout);
            assertEquals(nodeFingerprint(fixture, port), result.hostFingerprint);

            PineappleSshEngine.Result failed = PineappleSshEngine.exec(config, "exit-7");
            assertEquals(7, failed.exitCode);
            assertEquals("failed", failed.stderr);

            config.hostFingerprint = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
            try {
                PineappleSshEngine.exec(config, "echo denied");
                fail("mismatched host pin was accepted");
            } catch (Exception error) {
                assertTrue(error.getMessage().contains("does not match the saved pin"));
            }

            config.hostFingerprint = result.hostFingerprint;
            PineappleSshEngine.Result pinned = PineappleSshEngine.exec(config, "echo pinned");
            assertEquals(0, pinned.exitCode);
            assertEquals("OUT:echo pinned\n", pinned.stdout);

            config.hostFingerprint = "";
            config.password = "wrong";
            try {
                PineappleSshEngine.exec(config, "echo nope");
                fail("bad password was accepted");
            } catch (Exception error) {
                assertTrue(error.getMessage().toLowerCase().contains("auth"));
            }
        } finally {
            server.destroyForcibly();
            server.waitFor(5, TimeUnit.SECONDS);
        }
    }

    private static String nodeFingerprint(Path fixture, int port) throws Exception {
        Process client = new ProcessBuilder("node", fixture.toString(), "fingerprint", Integer.toString(port))
            .redirectErrorStream(true)
            .start();
        String output = new String(client.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        int status = client.waitFor();
        assertEquals(output, 0, status);
        assertEquals(64, output.length());
        return output;
    }
}
