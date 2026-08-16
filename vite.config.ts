import { execSync } from 'node:child_process';

import { defineConfig } from 'vite';

// 빌드 식별자 — 타이틀 화면에 찍어서 "지금 보는 게 어느 빌드인지"를 한눈에 알 수 있게 한다.
// 배포 직후 캐시된 옛 페이지를 새 빌드로 착각하는 사고를 막는 용도다.
function buildId(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    return sha;
  } catch {
    return 'dev';
  }
}

// base './' — Capacitor(파일 프로토콜)·itch.io(하위 경로 호스팅) 양쪽에서
// 상대 경로 자산 로드가 필요하다.
export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  // 지원 하한: Android System WebView / Chrome 80+ (ES2020 API 전부 내장).
  // 문법은 es2018로 트랜스파일해 구형 WebView의 SyntaxError 화이트스크린을 방지한다.
  // 소스맵은 기본 꺼짐 — 켜면 cap sync가 dist/의 .map(~10MB)까지 APK에 포함시킨다.
  build: {
    target: 'es2018',
    rollupOptions: {
      output: {
        // 번들 이름 고정 — GitHub Pages 는 배포마다 옛 해시 파일을 지우는데
        // index.html 은 max-age=600 으로 캐시된다. 해시 이름을 쓰면 배포 직후
        // 10분간 캐시된 HTML이 404 난 JS를 가리켜 "아예 안 열리는" 화면이 된다.
        // Pages 는 모든 파일을 max-age=600 으로 주므로 해시 캐싱의 이득도 없다.
        entryFileNames: 'assets/index.js',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
