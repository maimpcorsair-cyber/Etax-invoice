import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.th.etax.invoice',
  appName: 'e-Tax Invoice',
  webDir: 'dist',
  server: {
    // Production: ชี้ไปที่ Render.com backend โดยตรง (ไม่ใช้ Vite proxy)
    androidScheme: 'https',
    // สำหรับ dev ให้ comment บรรทัดนี้และใช้ npx cap run android --livereload
    // url: 'http://192.168.x.x:3000',
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
