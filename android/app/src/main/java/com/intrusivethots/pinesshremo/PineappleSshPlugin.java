package com.intrusivethots.pinesshremo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PineappleSsh")
public class PineappleSshPlugin extends Plugin {
    @PluginMethod
    public void exec(PluginCall call) {
        PineappleSshEngine.Config config = new PineappleSshEngine.Config();
        config.host = call.getString("host", "");
        Integer port = call.getInt("port");
        config.port = port == null ? 22 : port;
        config.username = call.getString("username", "root");
        config.authType = call.getString("authType", "password");
        config.password = call.getString("password", "");
        config.privateKey = call.getString("privateKey", "");
        config.passphrase = call.getString("passphrase", "");
        Integer timeoutMs = call.getInt("timeoutMs");
        config.timeoutMs = timeoutMs == null ? 0 : timeoutMs;
        config.hostFingerprint = call.getString("hostFingerprint", "");
        String command = call.getString("command", "");

        Thread worker = new Thread(() -> {
            try {
                PineappleSshEngine.Result result = PineappleSshEngine.exec(config, command);
                JSObject body = new JSObject();
                body.put("stdout", result.stdout);
                body.put("stderr", result.stderr);
                body.put("exitCode", result.exitCode);
                if (result.hostFingerprint != null) body.put("hostFingerprint", result.hostFingerprint);
                call.resolve(body);
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null || message.isEmpty() ? "SSH connection failed" : message);
            }
        }, "pineapple-ssh");
        worker.start();
    }
}
