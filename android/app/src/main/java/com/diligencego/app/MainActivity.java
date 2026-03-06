package com.diligencego.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;
import android.util.Log;
import android.view.WindowManager;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import android.widget.Toast;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    try {
      getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
      Log.d("DG", "FLAG_SECURE ativada (anti-screenshot)");
    } catch (Throwable t) {
      Log.e("DG", "Falha ao ativar FLAG_SECURE", t);
    }
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    try {
      Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
        Log.e("DG", "Uncaught exception", e);
      });
    } catch (Throwable t) {
      Log.e("DG", "Falha ao registrar UncaughtExceptionHandler", t);
    }

    int gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(this);
    if (gms != ConnectionResult.SUCCESS) {
      Log.e("DG", "Google Play Services indisponível. Código: " + gms);
      try {
        Toast.makeText(this, "GMS indisponível (código " + gms + ")", Toast.LENGTH_LONG).show();
      } catch (Throwable ignored) {}
    } else {
      Log.d("DG", "Google Play Services OK");
    }

    Log.d("DG", "Registrando plugins nativos no MainActivity");
    registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
    registerPlugin(com.capacitorjs.plugins.share.SharePlugin.class);
    registerPlugin(com.getcapacitor.plugin.http.Http.class);
    registerPlugin(com.capacitorjs.plugins.haptics.HapticsPlugin.class);
    registerPlugin(com.capacitorjs.plugins.actionsheet.ActionSheetPlugin.class);
    registerPlugin(GoogleAuth.class);
    Log.d("DG", "Plugin GoogleAuth registrado");
  }
}
