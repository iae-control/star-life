import { defineConfig } from 'vite';

// base './' — Capacitor(파일 프로토콜)·itch.io(하위 경로 호스팅) 양쪽에서
// 상대 경로 자산 로드가 필요하다.
export default defineConfig({
  base: './',
  // 지원 하한: Android System WebView / Chrome 80+ (ES2020 API 전부 내장).
  // 문법은 es2018로 트랜스파일해 구형 WebView의 SyntaxError 화이트스크린을 방지한다.
  // 소스맵은 기본 꺼짐 — 켜면 cap sync가 dist/의 .map(~10MB)까지 APK에 포함시킨다.
  build: {
    target: 'es2018',
  },
  server: {
    host: true,
    port: 5173,
  },
});
