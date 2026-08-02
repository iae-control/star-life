// 햅틱 — 웹은 navigator.vibrate(안드로이드 크롬), iOS 웹은 미지원이라 조용히 무시.
// 앱 패키징 시 Capacitor Haptics로 교체 지점 (PLAN 3장).
import { loadSave } from './Save';

export function vibrate(pattern: number | number[]): void {
  if (!loadSave().settings.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 미지원 환경 무시 */
  }
}
