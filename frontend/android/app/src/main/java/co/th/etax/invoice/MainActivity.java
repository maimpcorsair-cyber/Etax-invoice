package co.th.etax.invoice;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    /** Creates FCM notification channels required on Android O (API 26+). */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel etaxAlerts = new NotificationChannel(
            "etax_alerts",
            "e-Tax Alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        etaxAlerts.setDescription("Invoice and RD submission alerts");
        manager.createNotificationChannel(etaxAlerts);
    }
}
