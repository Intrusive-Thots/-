package com.intrusivethots.pinesshremo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PineappleSshPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
