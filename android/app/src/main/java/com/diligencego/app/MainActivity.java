package com.diligencego.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    registerPlugin(com.capacitorjs.plugins.filesystem.FilesystemPlugin.class);
    registerPlugin(com.capacitorjs.plugins.share.SharePlugin.class);
    registerPlugin(com.getcapacitor.plugin.http.Http.class);
    registerPlugin(com.capacitorjs.plugins.haptics.HapticsPlugin.class);
    registerPlugin(com.capacitorjs.plugins.actionsheet.ActionSheetPlugin.class);
  }
}
