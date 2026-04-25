import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.th.etax.invoice',
  appName: 'e-Tax Invoice',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'etax-invoice.vercel.app',
    // In production native build, /api/* calls are proxied to Render via Vercel rewrites
    // For local native dev with live reload: set url to your machine IP e.g. 'http://192.168.1.x:3000'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1d4ed8',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1d4ed8',
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
