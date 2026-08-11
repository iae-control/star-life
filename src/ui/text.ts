// 데모의 text() 헬퍼 대응 — 굵은 모노스페이스 + 1px 그림자.
import Phaser from 'phaser';

export function uiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): Phaser.GameObjects.Text {
  // 한글 픽셀 폰트: 9px 이하는 Galmuri9, 그 외 Galmuri11 (로드 실패 시 모노스페이스 폴백)
  const family =
    'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';
  const t = scene.add.text(x, y, s, {
    fontFamily: family,
    fontStyle: size <= 9 ? 'normal' : 'bold',
    fontSize: `${size}px`,
    color,
    letterSpacing: size >= 18 ? 1.2 : 0.35,
  });
  t.setShadow(0, 2, 'rgba(0,0,0,0.82)', size >= 18 ? 5 : 2);
  if (align === 'center') t.setOrigin(0.5, 0.5);
  else if (align === 'right') t.setOrigin(1, 0.5);
  else t.setOrigin(0, 0.5);
  return t;
}
