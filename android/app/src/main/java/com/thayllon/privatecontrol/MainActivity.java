package com.thayllon.privatecontrol;

import android.os.Bundle;
import com.aparajita.capacitor.biometricauth.BiometricAuthNative;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricAuthNative.class);
        super.onCreate(savedInstanceState);
    }
}
