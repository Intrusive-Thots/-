package com.intrusivethots.pinesshremo;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;

import org.bouncycastle.jce.provider.BouncyCastleProvider;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.Security;
import java.util.Properties;

/**
 * Opens a real SSH exec channel to the Pineapple. The Capacitor plugin is a thin wrapper around this class.
 */
public final class PineappleSshEngine {
    private static final int MAX_OUTPUT_CHARS = 200_000;

    static {
        try {
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }
        } catch (Throwable ignored) {
            // Java 21 already provides the host-key algorithms this client needs.
        }
    }

    public static final class Config {
        public String host = "";
        public int port = 22;
        public String username = "root";
        public String authType = "password";
        public String password = "";
        public String privateKey = "";
        public String passphrase = "";
        public int timeoutMs = 0;
        public String hostFingerprint = "";
    }

    public static final class Result {
        public String stdout = "";
        public String stderr = "";
        public int exitCode = 1;
        public String hostFingerprint;
    }

    private PineappleSshEngine() {}

    public static Result exec(Config config, String command) throws Exception {
        if (command == null || command.isEmpty()) {
            throw new IllegalArgumentException("Command string is required.");
        }
        String host = config.host == null ? "" : config.host.trim();
        if (host.isEmpty()) {
            throw new IllegalArgumentException("A target host is required.");
        }
        int port = config.port == 0 ? 22 : config.port;
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException("SSH port must be an integer from 1 to 65535.");
        }
        String username = config.username == null || config.username.trim().isEmpty() ? "root" : config.username.trim();
        boolean useKey = "key".equals(config.authType);
        if (useKey) {
            if (config.privateKey == null || config.privateKey.trim().isEmpty()) {
                throw new IllegalArgumentException("Private key authentication requires a private key.");
            }
        } else if (config.password == null || config.password.isEmpty()) {
            throw new IllegalArgumentException("SSH requires a password. Save one in Config before connecting.");
        }

        int readyTimeout = config.timeoutMs > 0 ? config.timeoutMs : 8000;
        int commandTimeout = config.timeoutMs > 0 ? Math.max(config.timeoutMs, 10000) : 30000;
        String expectedPin = config.hostFingerprint == null ? "" : config.hostFingerprint.trim().toLowerCase();

        JSch jsch = new JSch();
        if (useKey) {
            byte[] key = config.privateKey.getBytes(StandardCharsets.UTF_8);
            byte[] pass = config.passphrase == null || config.passphrase.isEmpty()
                ? null
                : config.passphrase.getBytes(StandardCharsets.UTF_8);
            jsch.addIdentity("pineapple", key, null, pass);
        }

        StringBuilder observed = new StringBuilder();
        boolean[] mismatch = new boolean[] { false };
        jsch.setHostKeyRepository(new PinnedHostKeys(expectedPin, observed, mismatch));

        Session session = jsch.getSession(username, host, port);
        PasswordPrompter prompter = new PasswordPrompter(config.password, config.passphrase);
        session.setUserInfo(prompter);
        if (!useKey) session.setPassword(config.password);
        Properties options = new Properties();
        options.put("StrictHostKeyChecking", "yes");
        options.put("PreferredAuthentications", useKey ? "publickey" : "password,keyboard-interactive");
        session.setConfig(options);
        session.setTimeout(commandTimeout);

        ChannelExec channel = null;
        try {
            session.connect(readyTimeout);
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            InputStream stdout = channel.getInputStream();
            InputStream stderr = channel.getErrStream();
            channel.connect(readyTimeout);

            StringBuilder out = new StringBuilder();
            StringBuilder err = new StringBuilder();
            byte[] buffer = new byte[8192];
            long deadline = System.currentTimeMillis() + commandTimeout;
            while (true) {
                drain(stdout, buffer, out);
                drain(stderr, buffer, err);
                if (channel.isClosed() && stdout.available() == 0 && stderr.available() == 0) {
                    break;
                }
                if (System.currentTimeMillis() > deadline) {
                    throw new IllegalStateException("Command timed out after " + Math.round(commandTimeout / 1000.0) + " seconds.");
                }
                Thread.sleep(20);
            }
            drain(stdout, buffer, out);
            drain(stderr, buffer, err);

            Result result = new Result();
            result.stdout = out.toString();
            result.stderr = err.toString();
            int status = channel.getExitStatus();
            result.exitCode = status < 0 ? 1 : status;
            result.hostFingerprint = observed.length() == 0 ? null : observed.toString();
            return result;
        } catch (Exception error) {
            if (mismatch[0]) {
                throw new IllegalStateException(
                    "SSH host key for " + host + ":" + port
                        + " does not match the saved pin. The connection was refused. Forget the trusted host key in Config if you replaced this device."
                );
            }
            if (error instanceof JSchException && error.getMessage() != null && error.getMessage().toLowerCase().contains("auth fail")) {
                throw new IllegalStateException("SSH authentication failed. Check the username and password.");
            }
            throw error;
        } finally {
            if (channel != null) {
                try {
                    channel.disconnect();
                } catch (Exception ignored) {
                }
            }
            try {
                session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    private static void drain(InputStream stream, byte[] buffer, StringBuilder into) throws Exception {
        while (stream.available() > 0) {
            int read = stream.read(buffer);
            if (read < 0) return;
            appendCapped(into, new String(buffer, 0, read, StandardCharsets.UTF_8));
        }
    }

    private static void appendCapped(StringBuilder into, String chunk) {
        if (into.length() >= MAX_OUTPUT_CHARS) return;
        if (into.indexOf("\n[output truncated]") >= 0) return;
        if (into.length() + chunk.length() <= MAX_OUTPUT_CHARS) {
            into.append(chunk);
            return;
        }
        into.append(chunk, 0, MAX_OUTPUT_CHARS - into.length());
        into.append("\n[output truncated]");
    }

    static String sha256Hex(byte[] key) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key);
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private static boolean samePin(String expected, String actual) {
        byte[] left = expected.getBytes(StandardCharsets.UTF_8);
        byte[] right = actual.getBytes(StandardCharsets.UTF_8);
        if (left.length == 0 || left.length != right.length) return false;
        return MessageDigest.isEqual(left, right);
    }

    private static final class PinnedHostKeys implements HostKeyRepository {
        private final String expected;
        private final StringBuilder observed;
        private final boolean[] mismatch;

        private PinnedHostKeys(String expected, StringBuilder observed, boolean[] mismatch) {
            this.expected = expected;
            this.observed = observed;
            this.mismatch = mismatch;
        }

        @Override
        public int check(String host, byte[] key) {
            try {
                String fingerprint = sha256Hex(key);
                observed.setLength(0);
                observed.append(fingerprint);
                if (expected == null || expected.isEmpty() || samePin(expected, fingerprint)) {
                    return OK;
                }
                mismatch[0] = true;
                return CHANGED;
            } catch (Exception error) {
                mismatch[0] = true;
                return CHANGED;
            }
        }

        @Override
        public void add(HostKey hostkey, UserInfo ui) {}

        @Override
        public void remove(String host, String type) {}

        @Override
        public void remove(String host, String type, byte[] key) {}

        @Override
        public String getKnownHostsRepositoryID() {
            return "pineapple-pin";
        }

        @Override
        public HostKey[] getHostKey() {
            return new HostKey[0];
        }

        @Override
        public HostKey[] getHostKey(String host, String type) {
            return new HostKey[0];
        }
    }

    private static final class PasswordPrompter implements UserInfo, UIKeyboardInteractive {
        private final String password;
        private final String passphrase;

        private PasswordPrompter(String password, String passphrase) {
            this.password = password == null ? "" : password;
            this.passphrase = passphrase == null ? "" : passphrase;
        }

        @Override
        public String getPassphrase() {
            return passphrase;
        }

        @Override
        public String getPassword() {
            return password;
        }

        @Override
        public boolean promptPassword(String message) {
            return !password.isEmpty();
        }

        @Override
        public boolean promptPassphrase(String message) {
            return !passphrase.isEmpty();
        }

        @Override
        public boolean promptYesNo(String message) {
            return false;
        }

        @Override
        public void showMessage(String message) {}

        @Override
        public String[] promptKeyboardInteractive(String destination, String name, String instruction, String[] prompt, boolean[] echo) {
            String[] answers = new String[prompt.length];
            for (int i = 0; i < answers.length; i++) answers[i] = password;
            return answers;
        }
    }
}
