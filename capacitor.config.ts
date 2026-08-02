import type { CapacitorConfig } from '@capacitor/cli';

// appId는 첫 스토어 업로드 전까지만 변경 가능 — M6 전에 최종 확정할 것.
const config: CapacitorConfig = {
  appId: 'com.jsh20907.starlife',
  appName: '별의 일생',
  webDir: 'dist',
};

export default config;
