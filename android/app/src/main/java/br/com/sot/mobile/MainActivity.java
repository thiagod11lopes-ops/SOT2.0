package br.com.sot.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SotNativeLocationPostPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
